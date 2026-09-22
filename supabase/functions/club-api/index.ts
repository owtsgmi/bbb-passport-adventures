import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPA_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEGACY_CLUB="00000000-0000-4000-8000-000000000001";
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store"
};

function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors})}
function cleanText(value:unknown,max:number){return String(value||"").trim().replace(/\s+/g," ").slice(0,max)}
function uuid(value:unknown){const s=String(value||"");return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""}
function ints(value:unknown){return Array.isArray(value)?[...new Set(value.map(Number).filter(Number.isSafeInteger).filter(n=>n>0&&n<100000))]:[]}
function randomCode(){const a=new Uint8Array(8);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase()}
function randomSlug(name:string){const base=name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,42)||"passport-club";return base+"-"+randomCode().slice(0,6).toLowerCase()}
function rewardRemaining(row:any){const total=Math.max(0,Number(row?.linden||0));if(row?.paid)return 0;return Math.max(0,total-Math.max(0,Number(row?.paid_linden||0)))}
async function sha256(s:string){const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s.trim().toUpperCase())));return Array.from(h,b=>b.toString(16).padStart(2,"0")).join("")}

async function db(path:string,init:RequestInit={}){
  const h=new Headers(init.headers||{});h.set("apikey",SERVICE);h.set("Authorization","Bearer "+SERVICE);
  if(init.body&&!h.has("Content-Type"))h.set("Content-Type","application/json");
  const r=await fetch(SUPA_URL+"/rest/v1/"+path,{...init,headers:h});
  const t=await r.text();if(!r.ok)throw new Error("db_"+r.status+"_"+t);
  return t?JSON.parse(t):null;
}
async function currentUser(req:Request){
  const bearer=req.headers.get("Authorization")||"";
  if(!bearer.startsWith("Bearer "))return null;
  const r=await fetch(SUPA_URL+"/auth/v1/user",{headers:{apikey:SERVICE,Authorization:bearer}});
  if(!r.ok)return null;return await r.json();
}
async function membership(clubId:string,userId:string){
  const rows=await db("club_members?club_id=eq."+clubId+"&user_id=eq."+userId+"&select=club_id,user_id,role");
  return rows?.[0]||null;
}
async function requireMember(clubId:string,userId:string){const m=await membership(clubId,userId);if(!m)throw new Error("not_a_club_member");return m}
function manager(m:any){return m?.role==="owner"||m?.role==="admin"}
async function loadClub(clubId:string,userId:string){
  const m=await requireMember(clubId,userId);
  const runs=await db("club_adventure_runs?club_id=eq."+clubId+"&select=*&order=started_at.asc");
  const runIds=runs.map((x:any)=>x.id);
  const [clubs,members,players,boards,participants,stamps,rewards,collectRequests]=await Promise.all([
    db("clubs?id=eq."+clubId+"&select=id,name,slug,owner_id,treasure_enabled,payout_threshold,is_legacy,created_at,updated_at"),
    db("club_members?club_id=eq."+clubId+"&select=user_id,role,joined_at&order=joined_at.asc"),
    db("club_players?club_id=eq."+clubId+"&select=id,user_id,display_name,sl_username,sort_order,is_active,is_payer,created_at,updated_at&order=sort_order.asc,created_at.asc"),
    db("club_board_state?club_id=eq."+clubId+"&select=*"),
    runIds.length?db("club_run_participants?select=run_id,player_id,joined_at&run_id=in.("+runIds.join(",")+")"):Promise.resolve([]),
    db("club_stamp_progress?club_id=eq."+clubId+"&select=player_id,stamp_id,source,completed_at"),
    db("club_rewards?club_id=eq."+clubId+"&select=*&order=awarded_at.desc"),
    db("club_collect_requests?club_id=eq."+clubId+"&select=*&order=created_at.desc&limit=50")
  ]);
  return {club:clubs?.[0],membership:m,members,players,board:boards?.[0],runs,participants,stamps,rewards,collect_requests:collectRequests};
}

function b64(s:string){const bin=atob(s);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
async function provesLegacySecret(secret:string){
  if(secret.length<8)return false;
  const rows=await db("bbb_private_settings?id=eq.1&select=ciphertext,iv,salt");const row=rows?.[0];
  if(!row?.ciphertext||!row?.iv||!row?.salt)return false;
  try{
    const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),"PBKDF2",false,["deriveKey"]);
    const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(row.salt),iterations:250000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(row.iv)},key,b64(row.ciphertext));
    const data=JSON.parse(new TextDecoder().decode(plain));return data&&typeof data==="object";
  }catch{return false}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return reply({ok:false,error:"post_required"},405);
  const user=await currentUser(req);if(!user?.id)return reply({ok:false,error:"sign_in_required"},401);
  let body:any={};try{body=await req.json()}catch{}
  const action=String(body.action||"list");
  try{
    if(action==="list"){
      const memberships=await db("club_members?user_id=eq."+user.id+"&select=club_id,role,joined_at&order=joined_at.asc");
      const ids=memberships.map((m:any)=>m.club_id);
      const clubs=ids.length?await db("clubs?id=in.("+ids.join(",")+")&select=id,name,slug,owner_id,treasure_enabled,payout_threshold,is_legacy,created_at,updated_at"):[];
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=user_id,display_name,sl_username"))?.[0]||null;
      return reply({ok:true,user:{id:user.id,email:user.email},profile,clubs:clubs.map((c:any)=>({...c,role:memberships.find((m:any)=>m.club_id===c.id)?.role||"member"}))});
    }
    if(action==="load")return reply({ok:true,...await loadClub(uuid(body.club_id),user.id)});

    if(action==="update_profile"){
      const display=cleanText(body.display_name,60);if(!display)return reply({ok:false,error:"display_name_required"},400);
      const sl=cleanText(body.sl_username,80)||null;
      const rows=await db("profiles?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({display_name:display,sl_username:sl})});
      await db("club_players?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({display_name:display,sl_username:sl})});
      return reply({ok:true,profile:rows?.[0]});
    }

    if(action==="create"){
      const name=cleanText(body.name,80);if(!name)return reply({ok:false,error:"club_name_required"},400);
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=display_name,sl_username"))?.[0]||{};
      const code=randomCode(),clubId=crypto.randomUUID();
      const club=(await db("clubs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id:clubId,name,slug:randomSlug(name),owner_id:user.id,join_code_hash:await sha256(code),treasure_enabled:false})}))?.[0];
      await db("club_members",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,user_id:user.id,role:"owner"})});
      await db("club_players",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,user_id:user.id,display_name:profile.display_name||"Adventurer",sl_username:profile.sl_username||null,sort_order:1,is_payer:true})});
      await db("club_board_state",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,updated_by:user.id})});
      return reply({ok:true,club,join_code:code});
    }

    if(action==="join"){
      const code=cleanText(body.join_code,40).toUpperCase();if(code.length<8)return reply({ok:false,error:"bad_join_code"},400);
      const clubs=await db("clubs?join_code_hash=eq."+await sha256(code)+"&select=id,name");const club=clubs?.[0];
      if(!club)return reply({ok:false,error:"join_code_not_found"},404);
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=display_name,sl_username"))?.[0]||{};
      await db("club_members?on_conflict=club_id,user_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({club_id:club.id,user_id:user.id,role:"member"})});
      const openPlayers=await db("club_players?club_id=eq."+club.id+"&user_id=is.null&is_active=eq.true&select=id");
      if(club.id===LEGACY_CLUB&&openPlayers.length===1){
        await db("club_players?id=eq."+openPlayers[0].id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id})});
      }else{
        await db("club_players?on_conflict=club_id,user_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({club_id:club.id,user_id:user.id,display_name:profile.display_name||"Adventurer",sl_username:profile.sl_username||null,sort_order:100})});
      }
      return reply({ok:true,club_id:club.id,club_name:club.name});
    }

    if(action==="claim_legacy"){
      const clubs=await db("clubs?id=eq."+LEGACY_CLUB+"&select=owner_id");const club=clubs?.[0];
      if(!club)return reply({ok:false,error:"legacy_club_missing"},404);
      if(club.owner_id&&club.owner_id!==user.id)return reply({ok:false,error:"legacy_club_already_claimed"},409);
      if(!await provesLegacySecret(String(body.secret||"")))return reply({ok:false,error:"wrong_club_code"},403);
      const playerId=uuid(body.player_id);const players=await db("club_players?id=eq."+playerId+"&club_id=eq."+LEGACY_CLUB+"&select=id,user_id");
      if(!players?.[0]||players[0].user_id&&players[0].user_id!==user.id)return reply({ok:false,error:"player_unavailable"},409);
      await db("clubs?id=eq."+LEGACY_CLUB,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({owner_id:user.id})});
      await db("club_members?on_conflict=club_id,user_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({club_id:LEGACY_CLUB,user_id:user.id,role:"owner"})});
      await db("club_players?id=eq."+playerId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:user.id})});
      const code=randomCode();await db("clubs?id=eq."+LEGACY_CLUB,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_code_hash:await sha256(code)})});
      return reply({ok:true,club_id:LEGACY_CLUB,join_code:code});
    }

    const clubId=uuid(body.club_id);if(!clubId)return reply({ok:false,error:"club_required"},400);
    const m=await requireMember(clubId,user.id);

    if(action==="rotate_invite"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const code=randomCode();await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_code_hash:await sha256(code)})});
      return reply({ok:true,join_code:code});
    }
    if(action==="update_club"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const patch:any={};if(body.name!==undefined){patch.name=cleanText(body.name,80);if(!patch.name)return reply({ok:false,error:"club_name_required"},400)}
      if(body.treasure_enabled!==undefined)patch.treasure_enabled=body.treasure_enabled===true;
      await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});return reply({ok:true});
    }
    if(action==="add_guest"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const display=cleanText(body.display_name,60);if(!display)return reply({ok:false,error:"display_name_required"},400);
      const rows=await db("club_players",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({club_id:clubId,display_name:display,sl_username:cleanText(body.sl_username,80)||null,sort_order:100})});
      return reply({ok:true,player:rows?.[0]});
    }
    if(action==="update_player"){
      const playerId=uuid(body.player_id),rows=await db("club_players?id=eq."+playerId+"&club_id=eq."+clubId+"&select=*");const p=rows?.[0];
      if(!p)return reply({ok:false,error:"player_not_found"},404);if(!manager(m)&&p.user_id!==user.id)return reply({ok:false,error:"not_authorized"},403);
      const patch:any={};if(body.display_name!==undefined){patch.display_name=cleanText(body.display_name,60);if(!patch.display_name)return reply({ok:false,error:"display_name_required"},400)}
      if(body.sl_username!==undefined)patch.sl_username=cleanText(body.sl_username,80)||null;
      if(manager(m)&&body.is_active!==undefined)patch.is_active=body.is_active===true;
      if(manager(m)&&body.is_payer!==undefined)patch.is_payer=body.is_payer===true;
      await db("club_players?id=eq."+playerId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});return reply({ok:true});
    }
    if(action==="save_board"){
      const patch:any={updated_by:user.id};
      if(body.started!==undefined)patch.started=ints(body.started);
      if(body.current_adventure!==undefined)patch.current_adventure=Math.max(0,Number(body.current_adventure)||0);
      if(body.adventure_locked!==undefined)patch.adventure_locked=body.adventure_locked===true;
      if(body.adventure_rewards&&typeof body.adventure_rewards==="object"&&!Array.isArray(body.adventure_rewards)&&JSON.stringify(body.adventure_rewards).length<100000)patch.adventure_rewards=body.adventure_rewards;
      if(Array.isArray(body.payout_log)&&JSON.stringify(body.payout_log).length<100000)patch.payout_log=body.payout_log.slice(0,250);
      await db("club_board_state?club_id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});return reply({ok:true});
    }
    if(action==="request_collect"){
      const playerId=uuid(body.player_id),player=(await db("club_players?id=eq."+playerId+"&club_id=eq."+clubId+"&select=id,user_id,display_name"))?.[0];
      if(!player)return reply({ok:false,error:"player_not_found"},404);if(!manager(m)&&player.user_id!==user.id)return reply({ok:false,error:"not_authorized"},403);
      const board=(await db("club_board_state?club_id=eq."+clubId+"&select=payout_log"))?.[0]||{};const log=Array.isArray(board.payout_log)?board.payout_log:[];
      const balance=log.reduce((n:number,r:any)=>n+rewardRemaining(r),0);if(balance<1000)return reply({ok:false,error:"threshold_not_met",balance},409);
      const existing=await db("club_collect_requests?club_id=eq."+clubId+"&beneficiary_player_id=eq."+playerId+"&status=eq.pending&select=id,created_at");
      if(existing?.[0])return reply({ok:true,already_requested:true,balance,requested_at:existing[0].created_at});
      const row=(await db("club_collect_requests",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({club_id:clubId,requested_by:user.id,beneficiary_player_id:playerId})}))?.[0];
      const payer=(await db("club_players?club_id=eq."+clubId+"&is_payer=eq.true&is_active=eq.true&select=display_name,sl_username&limit=1"))?.[0]||null;
      return reply({ok:true,balance,request:row,payer});
    }
    if(action==="mark_paid"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const board=(await db("club_board_state?club_id=eq."+clubId+"&select=payout_log"))?.[0]||{},log=Array.isArray(board.payout_log)?board.payout_log:[];
      const balance=log.reduce((n:number,r:any)=>n+rewardRemaining(r),0);if(balance<1000)return reply({ok:false,error:"threshold_not_met",balance},409);
      let left=1000;const now=new Date().toISOString();
      for(const item of log.map((r:any,i:number)=>({r,i})).sort((a:any,b:any)=>new Date(a.r?.at||0).getTime()-new Date(b.r?.at||0).getTime())){
        if(left<=0)break;const r=log[item.i],rem=rewardRemaining(r);if(rem<=0)continue;const take=Math.min(rem,left),already=Math.max(0,Number(r?.paid_linden||0));r.paid_linden=already+take;r.last_payment_at=now;r.last_payment_manual=true;if(r.paid_linden>=Math.max(0,Number(r?.linden||0))){r.paid=true;r.paid_at=r.paid_at||now}left-=take;
      }
      await db("club_board_state?club_id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({payout_log:log,updated_by:user.id})});
      await db("club_collect_requests?club_id=eq."+clubId+"&status=eq.pending",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"paid",handled_at:now,handled_by:user.id})});
      return reply({ok:true,paid:1000,remaining_balance:log.reduce((n:number,r:any)=>n+rewardRemaining(r),0)});
    }
    if(action==="start_adventure"){
      const adventureId=Number(body.adventure_id);if(!Number.isSafeInteger(adventureId)||adventureId<1)return reply({ok:false,error:"bad_adventure"},400);
      const run=(await db("club_adventure_runs?on_conflict=club_id,adventure_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({club_id:clubId,adventure_id:adventureId,status:"active",locked:true,started_by:user.id,completed_at:null})}))?.[0];
      const chosen=Array.isArray(body.player_ids)?body.player_ids.map(uuid).filter(Boolean):[];const active=await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&select=id");
      const allowed=new Set(active.map((p:any)=>p.id));const playerIds=(chosen.length?chosen:active.map((p:any)=>p.id)).filter((id:string)=>allowed.has(id));
      await db("club_run_participants?run_id=eq."+run.id,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      if(playerIds.length)await db("club_run_participants",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(playerIds.map((player_id:string)=>({run_id:run.id,player_id})))});
      const board=(await db("club_board_state?club_id=eq."+clubId+"&select=started"))?.[0]||{};
      await db("club_board_state?club_id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({started:[...new Set([...(board.started||[]),adventureId])],current_adventure:adventureId,adventure_locked:true,updated_by:user.id})});
      return reply({ok:true,run_id:run.id,participants:playerIds.length});
    }
    if(action==="set_stamp"){
      const playerId=uuid(body.player_id),stampId=Number(body.stamp_id);if(!playerId||!Number.isSafeInteger(stampId)||stampId<1)return reply({ok:false,error:"bad_stamp"},400);
      const player=(await db("club_players?id=eq."+playerId+"&club_id=eq."+clubId+"&select=id,user_id"))?.[0];
      if(!player)return reply({ok:false,error:"player_not_found"},404);if(!manager(m)&&player.user_id!==user.id)return reply({ok:false,error:"own_stamps_only"},403);
      if(body.completed===false)await db("club_stamp_progress?club_id=eq."+clubId+"&player_id=eq."+playerId+"&stamp_id=eq."+stampId,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      else await db("club_stamp_progress?on_conflict=club_id,player_id,stamp_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({club_id:clubId,player_id:playerId,stamp_id:stampId,source:body.source==="stafi"?"stafi":"manual",completed_by:user.id})});
      return reply({ok:true});
    }
    return reply({ok:false,error:"unknown_action"},400);
  }catch(e){const message=String((e as Error)?.message||e);console.error(message);const known=["not_a_club_member"];return reply({ok:false,error:known.includes(message)?message:"server_error"},known.includes(message)?403:500)}
});
