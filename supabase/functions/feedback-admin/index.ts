import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const BASE=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const cors={"Access-Control-Allow-Origin":"https://owtsgmi.github.io","Access-Control-Allow-Headers":"authorization,content-type,x-owner-code","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
async function hash(s:string){const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));return Array.from(h,b=>b.toString(16).padStart(2,"0")).join("")}
async function db(path:string,init:RequestInit={}){const headers=new Headers(init.headers||{});headers.set("apikey",KEY);headers.set("Authorization","Bearer "+KEY);if(init.body)headers.set("Content-Type","application/json");const r=await fetch(BASE+"/rest/v1/"+path,{...init,headers});if(!r.ok)throw new Error("database_error_"+r.status);const s=await r.text();return s?JSON.parse(s):null}
async function owner(req:Request){const code=req.headers.get("x-owner-code")||"";if(code.length<12)return false;const rows=await db("feedback_admin_config?id=eq.1&select=owner_code_sha256");return !!rows[0]?.owner_code_sha256&&(await hash(code))===rows[0].owner_code_sha256}
async function loggedIn(req:Request){const a=req.headers.get("Authorization")||"";if(!a.startsWith("Bearer pa_"))return false;const token=a.slice(7);if(token.length<20||token.length>300)return false;const rows=await db("passport_sessions?token_hash=eq."+(await hash(token))+"&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&select=user_id");if(!rows[0]?.user_id)return false;const users=await db("passport_users?id=eq."+rows[0].user_id+"&disabled_at=is.null&select=id");return users.length===1}
const fields="id,display_name,kind,message,page,status,is_pinned,is_hidden,created_at,updated_at";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 const action=new URL(req.url).searchParams.get("action")||"public_list";
 try{
  if(action==="public_list"&&req.method==="GET"){
   const rows=await db("app_feedback?select="+fields+"&is_hidden=eq.false&order=is_pinned.desc,created_at.desc&limit=100");
   return reply({ok:true,items:rows});
  }
  if(action==="submit"&&req.method==="POST"){
   if(!(await loggedIn(req)))return reply({ok:false,error:"sign_in_required"},401);
   const b=await req.json();
   const name=String(b.display_name||"").trim().slice(0,60);
   const msg=String(b.message||"").trim();
   const kind=String(b.kind||"");
   const page=String(b.page||"").trim().slice(0,120);
   if(!name||msg.length<2||msg.length>2000||!["suggestion","bug","comment"].includes(kind))return reply({ok:false,error:"invalid_feedback"},400);
   await db("app_feedback",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({display_name:name,message:msg,kind,page})});
   return reply({ok:true});
  }
  if(!(await owner(req)))return reply({ok:false,error:"unauthorized"},401);
  if(action==="list"&&req.method==="GET"){const rows=await db("app_feedback?select="+fields+"&order=is_pinned.desc,created_at.desc&limit=250");return reply({ok:true,items:rows})}
  if(req.method!=="POST")return reply({ok:false,error:"method"},405);
  const b=await req.json();const id=Number(b.id);
  if(!Number.isSafeInteger(id)||id<1)return reply({ok:false,error:"invalid_id"},400);
  if(action==="delete"){await db("app_feedback?id=eq."+id,{method:"DELETE",headers:{Prefer:"return=minimal"}});return reply({ok:true})}
  if(action==="update"){
    const patch:Record<string,unknown>={};
    if(typeof b.display_name==="string"&&b.display_name.trim().length>=1&&b.display_name.trim().length<=60)patch.display_name=b.display_name.trim();
    if(["suggestion","bug","comment"].includes(b.kind))patch.kind=b.kind;
    if(typeof b.message==="string"&&b.message.trim().length>=2&&b.message.trim().length<=2000)patch.message=b.message.trim();
    if(typeof b.page==="string"&&b.page.length<=120)patch.page=b.page.trim();
    if(["open","planned","fixed","closed"].includes(b.status))patch.status=b.status;
    if(typeof b.is_pinned==="boolean")patch.is_pinned=b.is_pinned;
    if(typeof b.is_hidden==="boolean")patch.is_hidden=b.is_hidden;
    patch.updated_at=new Date().toISOString();
    const rows=await db("app_feedback?id=eq."+id,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(patch)});
    return reply({ok:true,item:rows[0]||null});
  }
  return reply({ok:false,error:"unknown_action"},400);
 }catch(_e){return reply({ok:false,error:"server_error"},500)}
});
