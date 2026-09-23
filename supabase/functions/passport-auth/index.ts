import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPA_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store"
};

function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors})}
function clean(value:unknown,max:number){return String(value||"").trim().replace(/\s+/g," ").slice(0,max)}
function normalizeUsername(value:unknown){return clean(value,80).toLowerCase().replace(/\s+/g,".")}
async function sha256(value:string){const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return Array.from(h,b=>b.toString(16).padStart(2,"0")).join("")}
function randomToken(prefix="pa_"){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return prefix+btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}

async function db(path:string,init:RequestInit={}){
  const h=new Headers(init.headers||{});h.set("apikey",SERVICE);h.set("Authorization","Bearer "+SERVICE);
  if(init.body&&!h.has("Content-Type"))h.set("Content-Type","application/json");
  const r=await fetch(SUPA_URL+"/rest/v1/"+path,{...init,headers:h});
  const text=await r.text();if(!r.ok)throw new Error("db_"+r.status+"_"+text);return text?JSON.parse(text):null;
}
async function rpc(name:string,body:unknown){return await db("rpc/"+name,{method:"POST",body:JSON.stringify(body)})}
function bearer(req:Request){const value=req.headers.get("Authorization")||"";return value.startsWith("Bearer pa_")?value.slice(7):""}
function clientIp(req:Request){return (req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"unknown").split(",")[0].trim().slice(0,80)}

async function rateKey(req:Request,action:string,username:string){return await sha256(SERVICE+"|"+clientIp(req)+"|"+action+"|"+username)}
async function rateCheck(req:Request,action:"login"|"register",username:string){
  const key=await rateKey(req,action,username),rows=await db("passport_auth_attempts?key_hash=eq."+key+"&action=eq."+action+"&select=attempts,window_started_at"),row=rows?.[0];
  const windowMs=action==="login"?15*60*1000:60*60*1000,max=action==="login"?10:5;
  if(!row||Date.now()-new Date(row.window_started_at).getTime()>windowMs)return {key,attempts:0,max};
  if(Number(row.attempts)>=max)throw new Error("too_many_attempts");return {key,attempts:Number(row.attempts),max};
}
async function rateFail(action:"login"|"register",state:{key:string,attempts:number}){
  await db("passport_auth_attempts?on_conflict=key_hash,action",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({key_hash:state.key,action,attempts:state.attempts+1,window_started_at:state.attempts?undefined:new Date().toISOString(),updated_at:new Date().toISOString()})});
}
async function rateClear(action:"login"|"register",key:string){await db("passport_auth_attempts?key_hash=eq."+key+"&action=eq."+action,{method:"DELETE",headers:{Prefer:"return=minimal"}})}

async function issueSession(user:any,req:Request){
  const token=randomToken("pa_"),tokenHash=await sha256(token),expires=new Date(Date.now()+90*24*60*60*1000).toISOString();
  await db("passport_sessions",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({token_hash:tokenHash,user_id:user.id,expires_at:expires,user_agent:clean(req.headers.get("user-agent"),300)||null})});
  return {token,expires_at:expires,user:{id:user.id,sl_username:user.sl_username,display_name:user.display_name}};
}
async function sessionUser(req:Request){
  const token=bearer(req);if(!token)return null;const hash=await sha256(token);
  const rows=await db("passport_sessions?token_hash=eq."+hash+"&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&select=user_id,expires_at");
  const session=rows?.[0];if(!session)return null;
  const users=await db("passport_users?id=eq."+session.user_id+"&disabled_at=is.null&select=id,sl_username,display_name");const user=users?.[0];if(!user)return null;
  await db("passport_sessions?token_hash=eq."+hash,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_seen_at:new Date().toISOString()})});
  return {hash,expires_at:session.expires_at,user};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return reply({ok:false,error:"invalid_json"},400)}
  const action=clean(body.action,24);
  try{
    if(action==="register"){
      const username=normalizeUsername(body.sl_username),password=String(body.password||""),display=clean(body.display_name||body.sl_username,60);
      if(!/^[a-z0-9][a-z0-9.]{1,78}[a-z0-9]$/.test(username))return reply({ok:false,error:"invalid_sl_username"},400);
      if(password.length<8||password.length>128)return reply({ok:false,error:"password_length"},400);
      const limit=await rateCheck(req,"register",username),id=crypto.randomUUID();
      try{
        const rows=await rpc("passport_register_user",{p_user_id:id,p_sl_username:username,p_password:password,p_display_name:display});
        await rateClear("register",limit.key);return reply({ok:true,...await issueSession(rows[0],req)});
      }catch(e){await rateFail("register",limit);const message=String(e);return reply({ok:false,error:message.includes("23505")?"username_unavailable":"registration_failed"},message.includes("23505")?409:400)}
    }
    if(action==="login"){
      const username=normalizeUsername(body.sl_username),password=String(body.password||"");
      const limit=await rateCheck(req,"login",username),rows=await rpc("passport_verify_password",{p_sl_username:username,p_password:password});
      if(!rows?.[0]){await rateFail("login",limit);return reply({ok:false,error:"invalid_login"},401)}
      await rateClear("login",limit.key);return reply({ok:true,...await issueSession(rows[0],req)});
    }
    if(action==="session"){
      const session=await sessionUser(req);return session?reply({ok:true,user:session.user,expires_at:session.expires_at}):reply({ok:false,error:"sign_in_required"},401);
    }
    if(action==="logout"){
      const token=bearer(req);if(token)await db("passport_sessions?token_hash=eq."+await sha256(token),{method:"DELETE",headers:{Prefer:"return=minimal"}});return reply({ok:true});
    }
    return reply({ok:false,error:"unknown_action"},400);
  }catch(e){return reply({ok:false,error:String(e).includes("too_many_attempts")?"too_many_attempts":"server_error"},String(e).includes("too_many_attempts")?429:500)}
});
