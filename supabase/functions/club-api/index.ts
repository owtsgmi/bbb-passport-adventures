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
function cleanText(value:unknown,max:number){return String(value||"").trim().replace(/\s+/g," ").slice(0,max)}
function uuid(value:unknown){const s=String(value||"");return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""}
function ints(value:unknown){return Array.isArray(value)?[...new Set(value.map(Number).filter(Number.isSafeInteger).filter(n=>n>0&&n<100000))]:[]}
function randomCode(){const a=new Uint8Array(16);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase()}
function randomSlug(name:string){const base=name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,42)||"passport-club";return base+"-"+randomCode().slice(0,6).toLowerCase()}
function randomReward(){const a=new Uint32Array(1);crypto.getRandomValues(a);return 20+(a[0]%81)}
function rewardRemaining(row:any){return Math.max(0,Number(row?.amount||0)-Math.max(0,Number(row?.paid_amount||0)))}
async function sha256(s:string){const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s.trim().toUpperCase())));return Array.from(h,b=>b.toString(16).padStart(2,"0")).join("")}
async function sha256Raw(s:string){const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));return Array.from(h,b=>b.toString(16).padStart(2,"0")).join("")}

function stafiUrl(value:unknown){
  const raw=String(value||"").trim().slice(0,1000);if(!raw)return "";
  try{
    const u=new URL(raw),host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();
    const hasRef=[...u.searchParams.keys()].some(k=>k.toLowerCase()==="ref"&&String(u.searchParams.get(k)||"").trim());
    if(!(["http:","https:"].includes(u.protocol))||!(host==="thebbbbug.com"||host==="www.thebbbbug.com")||path!=="/utils/yourstamps.php"||!hasRef||u.username||u.password)return "";
    if(u.port&&!((u.protocol==="http:"&&u.port==="80")||(u.protocol==="https:"&&u.port==="443")))return "";
    u.hash="";return u.toString();
  }catch{return ""}
}
function stampRefs(value:unknown,ids:number[]){
  if(!Array.isArray(value)||value.length!==3)return [];
  const allowed=new Set(ids),seen=new Set<number>(),out:any[]=[];
  for(const item of value){
    const id=Number(item?.id),name=cleanText(item?.name,180),region=cleanText(item?.region,128),x=Number(item?.x),y=Number(item?.y),z=Number(item?.z);
    if(!Number.isSafeInteger(id)||!allowed.has(id)||seen.has(id)||!name||!region||![x,y,z].every(Number.isFinite)||x<0||x>256||y<0||y>256||z<0||z>10000)return [];
    seen.add(id);out.push({id,name,region,x:Math.round(x),y:Math.round(y),z:Math.round(z)});
  }
  return out;
}
function decodeHtml(s:string){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g," ").toLowerCase()}
function lastMarker(text:string,patterns:RegExp[]){let best=-1;for(const pattern of patterns){pattern.lastIndex=0;let m;while((m=pattern.exec(text)))best=Math.max(best,m.index);pattern.lastIndex=0}return best}
function stafiClassification(text:string,ref:any){
  const needles=[String(ref.name||"").toLowerCase(),String(ref.region||"").toLowerCase()].filter(x=>x.length>=4),positions:number[]=[];
  for(const needle of needles){let at=text.indexOf(needle);while(at>=0&&positions.length<20){positions.push(at);at=text.indexOf(needle,at+needle.length)}}
  const positive=[/stamps? (?:you )?(?:have|collected|obtained|visited)/g,/collected stamps?/g,/already collected/g,/completed stamps?/g];
  const negative=[/stamps? (?:you )?(?:need|have not|haven't|do not have|don't have)/g,/not (?:yet )?collected/g,/uncollected stamps?/g,/missing stamps?/g,/still needed/g];
  let positiveHit=false,negativeHit=false;
  for(const at of positions){const before=text.slice(Math.max(0,at-4000),at),row=text.slice(Math.max(0,at-220),Math.min(text.length,at+220));const p=lastMarker(before,positive),n=lastMarker(before,negative);if(/not (?:yet )?collected|uncollected|missing|still needed|need this/i.test(row))negativeHit=true;else if(/collected|completed|obtained|visited|you have/i.test(row))positiveHit=true;else if(p>n&&p>=0)positiveHit=true;else if(n>p&&n>=0)negativeHit=true}
  return positiveHit&&!negativeHit?"collected":negativeHit&&!positiveHit?"missing":"unknown";
}
async function fetchStaFi(raw:string){
  let url=stafiUrl(raw);if(!url)throw new Error("invalid_stafi_url");
  for(let hops=0;hops<4;hops++){
    const r=await fetch(url,{redirect:"manual",headers:{Accept:"text/html,text/plain;q=0.9","User-Agent":"BBB-Passport-Adventures/1.0"},signal:AbortSignal.timeout(12000)});
    if(r.status>=300&&r.status<400){const next=r.headers.get("location");if(!next)throw new Error("stafi_redirect_failed");url=stafiUrl(new URL(next,url).toString());if(!url)throw new Error("stafi_redirect_blocked");continue}
    if(!r.ok)throw new Error("stafi_http_"+r.status);const length=Number(r.headers.get("content-length")||0);if(length>2_000_000)throw new Error("stafi_page_too_large");const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.byteLength>2_000_000)throw new Error("stafi_page_too_large");return {url,text:decodeHtml(new TextDecoder().decode(bytes))};
  }
  throw new Error("stafi_too_many_redirects");
}

async function db(path:string,init:RequestInit={}){
  const h=new Headers(init.headers||{});h.set("apikey",SERVICE);h.set("Authorization","Bearer "+SERVICE);
  if(init.body&&!h.has("Content-Type"))h.set("Content-Type","application/json");
  const r=await fetch(SUPA_URL+"/rest/v1/"+path,{...init,headers:h});
  const t=await r.text();if(!r.ok)throw new Error("db_"+r.status+"_"+t);
  return t?JSON.parse(t):null;
}
async function currentUser(req:Request){
  const bearer=req.headers.get("Authorization")||"";
  if(!bearer.startsWith("Bearer pa_"))return null;
  const token=bearer.slice(7),hash=await sha256Raw(token),now=encodeURIComponent(new Date().toISOString());
  const sessions=await db("passport_sessions?token_hash=eq."+hash+"&expires_at=gt."+now+"&select=user_id");
  const row=sessions?.[0];if(!row)return null;
  const users=await db("passport_users?id=eq."+row.user_id+"&disabled_at=is.null&select=id,sl_username,display_name");
  return users?.[0]||null;
}
async function membership(clubId:string,userId:string){
  const rows=await db("club_members?club_id=eq."+clubId+"&user_id=eq."+userId+"&select=club_id,user_id,role");
  return rows?.[0]||null;
}
async function requireMember(clubId:string,userId:string){const m=await membership(clubId,userId);if(!m)throw new Error("not_a_club_member");return m}
function manager(m:any){return m?.role==="owner"||m?.role==="admin"}
async function normalizeTreasureRoles(clubId:string){
  const players=await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&select=id,is_payer,is_beneficiary,sort_order,created_at&order=sort_order.asc,created_at.asc");
  if(!players.length){
    await db("club_players?club_id=eq."+clubId+"&is_payer=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:false})});
    await db("club_players?club_id=eq."+clubId+"&is_beneficiary=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:false})});
    return {payer_id:null,beneficiary_id:null};
  }
  const payer=players.find((p:any)=>p.is_payer)||players[0];
  const beneficiary=players.find((p:any)=>p.is_beneficiary&&p.id!==payer.id)||players.find((p:any)=>p.id!==payer.id)||null;
  await db("club_players?club_id=eq."+clubId+"&is_payer=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:false})});
  await db("club_players?club_id=eq."+clubId+"&is_beneficiary=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:false})});
  await db("club_players?id=eq."+payer.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:true,is_beneficiary:false})});
  if(beneficiary)await db("club_players?id=eq."+beneficiary.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:true,is_payer:false})});
  return {payer_id:payer.id,beneficiary_id:beneficiary?.id||null};
}
async function clubBalance(clubId:string,beneficiaryId=""){
  const suffix=beneficiaryId?"&beneficiary_player_id=eq."+beneficiaryId:"";
  const rows=await db("club_rewards?club_id=eq."+clubId+suffix+"&select=amount,paid_amount");
  return rows.reduce((sum:number,row:any)=>sum+rewardRemaining(row),0);
}
async function finalizeRun(clubId:string,adventureId:number){
  const run=(await db("club_adventure_runs?club_id=eq."+clubId+"&adventure_id=eq."+adventureId+"&select=id,status,stamp_ids"))?.[0];
  if(!run||run.status==="completed")return null;
  const stampIds=ints(run.stamp_ids);if(stampIds.length!==3)return null;
  const participants=await db("club_run_participants?run_id=eq."+run.id+"&select=player_id");
  const playerIds=participants.map((p:any)=>p.player_id);if(!playerIds.length)return null;
  const progress=await db("club_stamp_progress?club_id=eq."+clubId+"&player_id=in.("+playerIds.join(",")+")&stamp_id=in.("+stampIds.join(",")+")&select=player_id,stamp_id");
  const complete=playerIds.every((playerId:string)=>stampIds.every((stampId:number)=>progress.some((p:any)=>p.player_id===playerId&&Number(p.stamp_id)===stampId)));
  if(!complete)return null;
  const now=new Date().toISOString();
  await db("club_adventure_runs?id=eq."+run.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"completed",completed_at:now})});
  const club=(await db("clubs?id=eq."+clubId+"&select=treasure_enabled"))?.[0];
  if(!club?.treasure_enabled)return {completed:true,reward:null};
  const existing=(await db("club_rewards?run_id=eq."+run.id+"&select=*"))?.[0];
  if(existing)return {completed:true,reward:existing};
  const beneficiary=(await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&is_beneficiary=eq.true&is_payer=eq.false&select=id&limit=1"))?.[0]
    ||(await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&is_payer=eq.false&select=id&order=sort_order.asc,created_at.asc&limit=1"))?.[0];
  if(!beneficiary)return {completed:true,reward:null};
  const created=(await db("club_rewards?on_conflict=run_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({club_id:clubId,run_id:run.id,beneficiary_player_id:beneficiary.id,amount:randomReward()})}))?.[0];
  const reward=created||(await db("club_rewards?run_id=eq."+run.id+"&select=*"))?.[0]||null;
  return {completed:true,reward};
}
async function loadClub(clubId:string,userId:string){
  const m=await requireMember(clubId,userId);
  const runs=await db("club_adventure_runs?club_id=eq."+clubId+"&select=*&order=started_at.asc");
  const runIds=runs.map((x:any)=>x.id);
  const [clubs,members,players,boards,participants,stamps,rewards,collectRequests]=await Promise.all([
    db("clubs?id=eq."+clubId+"&select=id,name,slug,owner_id,treasure_enabled,payout_threshold,is_legacy,created_at,updated_at"),
    db("club_members?club_id=eq."+clubId+"&select=user_id,role,joined_at&order=joined_at.asc"),
    db("club_players?club_id=eq."+clubId+"&select=id,user_id,display_name,sl_username,sort_order,is_active,is_payer,is_beneficiary,created_at,updated_at&order=sort_order.asc,created_at.asc"),
    db("club_board_state?club_id=eq."+clubId+"&select=*"),
    runIds.length?db("club_run_participants?select=run_id,player_id,joined_at&run_id=in.("+runIds.join(",")+")"):Promise.resolve([]),
    db("club_stamp_progress?club_id=eq."+clubId+"&select=player_id,stamp_id,source,completed_at"),
    db("club_rewards?club_id=eq."+clubId+"&select=*&order=awarded_at.desc"),
    db("club_collect_requests?club_id=eq."+clubId+"&select=*&order=created_at.desc&limit=50")
  ]);
  return {club:clubs?.[0],membership:m,members,players,board:boards?.[0],runs,participants,stamps,rewards,collect_requests:collectRequests};
}

async function syncStaFi(userId:string,clubId:string,force=false){
  const settings=(await db("user_private_settings?user_id=eq."+userId+"&select=stafi_url,stafi_sync_enabled"))?.[0];
  if(!settings?.stafi_url)return {enabled:false,error:"stafi_url_required",imported:0};
  if(!force&&!settings.stafi_sync_enabled)return {enabled:false,error:"stafi_sync_disabled",imported:0};
  const now=new Date().toISOString();
  try{
    const page=await fetchStaFi(settings.stafi_url);
    const player=(await db("club_players?club_id=eq."+clubId+"&user_id=eq."+userId+"&is_active=eq.true&select=id"))?.[0];
    if(!player)throw new Error("linked_player_required");
    const runs=await db("club_adventure_runs?club_id=eq."+clubId+"&status=eq.active&select=id,adventure_id,stamp_ids,stamp_refs");
    const runIds=runs.map((r:any)=>r.id),participants=runIds.length?await db("club_run_participants?player_id=eq."+player.id+"&run_id=in.("+runIds.join(",")+")&select=run_id"):[];
    const participating=new Set(participants.map((p:any)=>p.run_id)),existing=await db("club_stamp_progress?club_id=eq."+clubId+"&player_id=eq."+player.id+"&select=stamp_id");
    const completed=new Set(existing.map((p:any)=>Number(p.stamp_id))),rows:any[]=[],checked:number[]=[];
    for(const run of runs){
      if(!participating.has(run.id))continue;
      for(const ref of Array.isArray(run.stamp_refs)?run.stamp_refs:[]){const id=Number(ref.id);if(!Number.isSafeInteger(id)||completed.has(id))continue;checked.push(id);if(stafiClassification(page.text,ref)==="collected"){rows.push({club_id:clubId,player_id:player.id,stamp_id:id,source:"stafi",completed_by:userId});completed.add(id)}}
    }
    if(rows.length)await db("club_stamp_progress?on_conflict=club_id,player_id,stamp_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(rows)});
    const status={stafi_sync_enabled:true,stafi_verified_at:now,stafi_last_sync_at:now,stafi_last_success_at:now,stafi_last_error:null,stafi_last_stamp_count:completed.size};
    await db("user_private_settings?user_id=eq."+userId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(status)});
    for(const run of runs)if(participating.has(run.id))await finalizeRun(clubId,Number(run.adventure_id));
    return {enabled:true,verified:true,imported:rows.length,checked:[...new Set(checked)].length,total:completed.size};
  }catch(e){
    const raw=String((e as Error)?.message||e),safe=/^(invalid_stafi_url|stafi_redirect_failed|stafi_redirect_blocked|stafi_http_\d{3}|stafi_page_too_large|stafi_too_many_redirects|linked_player_required)$/.test(raw)?raw:"stafi_unavailable";
    await db("user_private_settings?user_id=eq."+userId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({stafi_last_sync_at:now,stafi_last_error:safe})});
    return {enabled:!!settings.stafi_sync_enabled,verified:false,error:safe,imported:0};
  }
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
      const privateSettings=(await db("user_private_settings?user_id=eq."+user.id+"&select=stafi_url,stafi_sync_enabled,stafi_verified_at,stafi_last_sync_at,stafi_last_success_at,stafi_last_error,stafi_last_stamp_count"))?.[0]||null;
      return reply({ok:true,user:{id:user.id,sl_username:user.sl_username,display_name:user.display_name},profile,private_settings:privateSettings,clubs:clubs.map((c:any)=>({...c,role:memberships.find((m:any)=>m.club_id===c.id)?.role||"member"}))});
    }
    if(action==="load")return reply({ok:true,...await loadClub(uuid(body.club_id),user.id)});

    if(action==="update_profile"){
      const display=cleanText(body.display_name,60);if(!display)return reply({ok:false,error:"display_name_required"},400);
      const sl=user.sl_username;
      const stafi=body.stafi_url===undefined?undefined:(body.stafi_url?stafiUrl(body.stafi_url):null);if(body.stafi_url&&!stafi)return reply({ok:false,error:"invalid_stafi_url"},400);
      const rows=await db("profiles?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({display_name:display,sl_username:sl})});
      await db("club_players?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({display_name:display,sl_username:sl})});
      if(stafi!==undefined){const current=(await db("user_private_settings?user_id=eq."+user.id+"&select=stafi_url"))?.[0];const changed=(current?.stafi_url||null)!==stafi;await db("user_private_settings?on_conflict=user_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,stafi_url:stafi,...(changed?{stafi_sync_enabled:false,stafi_verified_at:null,stafi_last_error:null}:{})})})}
      return reply({ok:true,profile:rows?.[0]});
    }

    if(action==="create"){
      const name=cleanText(body.name,80);if(!name)return reply({ok:false,error:"club_name_required"},400);
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=display_name,sl_username"))?.[0]||{};
      const code=randomCode(),clubId=crypto.randomUUID();
      const club=(await db("clubs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id:clubId,name,slug:randomSlug(name),owner_id:user.id,join_code_hash:await sha256(code),treasure_enabled:false})}))?.[0];
      await db("club_members",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,user_id:user.id,role:"owner"})});
      await db("club_players",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,user_id:user.id,display_name:profile.display_name||"Adventurer",sl_username:profile.sl_username||null,sort_order:1,is_payer:true,is_beneficiary:false,claimed_at:new Date().toISOString()})});
      await db("club_board_state",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,updated_by:user.id})});
      return reply({ok:true,club,join_code:code});
    }

    if(action==="join"){
      const code=cleanText(body.join_code,40).toUpperCase();if(code.length<8)return reply({ok:false,error:"bad_join_code"},400);
      const limiter=(await db("profiles?user_id=eq."+user.id+"&select=join_attempts,join_window_started_at"))?.[0]||{};
      const windowStart=limiter.join_window_started_at?new Date(limiter.join_window_started_at).getTime():0,inside=windowStart&&Date.now()-windowStart<10*60*1000,attempts=inside?Math.max(0,Number(limiter.join_attempts||0)):0;
      if(attempts>=20)return reply({ok:false,error:"join_rate_limited"},429);
      await db("profiles?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_attempts:attempts+1,join_window_started_at:inside?limiter.join_window_started_at:new Date().toISOString()})});
      const clubs=await db("clubs?join_code_hash=eq."+await sha256(code)+"&select=id,name");const club=clubs?.[0];
      if(!club)return reply({ok:false,error:"join_code_not_found"},404);
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=display_name,sl_username"))?.[0]||{};
      await db("club_members?on_conflict=club_id,user_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({club_id:club.id,user_id:user.id,role:"member"})});
      await db("club_players?on_conflict=club_id,user_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({club_id:club.id,user_id:user.id,display_name:profile.display_name||"Adventurer",sl_username:profile.sl_username||user.sl_username,sort_order:100,claimed_at:new Date().toISOString()})});
      await normalizeTreasureRoles(club.id);
      await db("profiles?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_attempts:0,join_window_started_at:null})});
      return reply({ok:true,club_id:club.id,club_name:club.name});
    }

    const clubId=uuid(body.club_id);if(!clubId)return reply({ok:false,error:"club_required"},400);
    const m=await requireMember(clubId,user.id);

    if(action==="verify_stafi"||action==="sync_stafi")return reply({ok:true,...await syncStaFi(user.id,clubId,action==="verify_stafi")});

    if(action==="rotate_invite"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const code=randomCode();await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_code_hash:await sha256(code)})});
      return reply({ok:true,join_code:code});
    }
    if(action==="update_club"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const patch:any={};if(body.name!==undefined){patch.name=cleanText(body.name,80);if(!patch.name)return reply({ok:false,error:"club_name_required"},400)}
      if(body.treasure_enabled!==undefined)patch.treasure_enabled=body.treasure_enabled===true;
      await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
      if(body.treasure_enabled===true)await normalizeTreasureRoles(clubId);
      return reply({ok:true});
    }
    if(action==="set_treasure_roles"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const payerId=uuid(body.payer_player_id),beneficiaryId=uuid(body.beneficiary_player_id);
      const players=await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&select=id,display_name,sl_username,is_payer,is_beneficiary&order=sort_order.asc,created_at.asc");
      const payer=players.find((p:any)=>p.id===payerId);
      if(!payer)return reply({ok:false,error:"payer_required"},400);
      if(beneficiaryId&&beneficiaryId===payerId)return reply({ok:false,error:"treasure_roles_must_differ"},409);
      const beneficiary=beneficiaryId?players.find((p:any)=>p.id===beneficiaryId):null;
      if(players.length>1&&!beneficiary)return reply({ok:false,error:"beneficiary_required"},400);
      await db("club_players?club_id=eq."+clubId+"&is_payer=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:false})});
      await db("club_players?club_id=eq."+clubId+"&is_beneficiary=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:false})});
      await db("club_players?id=eq."+payer.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:true,is_beneficiary:false})});
      if(beneficiary)await db("club_players?id=eq."+beneficiary.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:true,is_payer:false})});
      return reply({ok:true,payer_player_id:payer.id,beneficiary_player_id:beneficiary?.id||null});
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
      if(manager(m)&&body.is_payer===true){await db("club_players?club_id=eq."+clubId+"&is_payer=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:false})});patch.is_payer=true;patch.is_beneficiary=false}
      if(manager(m)&&body.is_beneficiary===true){await db("club_players?club_id=eq."+clubId+"&is_beneficiary=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:false})});patch.is_beneficiary=true;patch.is_payer=false}
      await db("club_players?id=eq."+playerId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});return reply({ok:true});
    }
    if(action==="set_member_role"){
      if(m.role!=="owner")return reply({ok:false,error:"owner_required"},403);
      const targetUser=uuid(body.user_id),role=String(body.role||"");if(!targetUser||!(["admin","member"].includes(role)))return reply({ok:false,error:"bad_member_role"},400);
      const target=(await db("club_members?club_id=eq."+clubId+"&user_id=eq."+targetUser+"&select=role"))?.[0];if(!target)return reply({ok:false,error:"member_not_found"},404);if(target.role==="owner")return reply({ok:false,error:"owner_role_locked"},409);
      await db("club_members?club_id=eq."+clubId+"&user_id=eq."+targetUser,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({role})});return reply({ok:true});
    }
    if(action==="remove_member"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const targetUser=uuid(body.user_id),target=(await db("club_members?club_id=eq."+clubId+"&user_id=eq."+targetUser+"&select=role"))?.[0];if(!target)return reply({ok:false,error:"member_not_found"},404);
      if(target.role==="owner"||(m.role!=="owner"&&target.role==="admin"))return reply({ok:false,error:"not_authorized"},403);
      await db("club_members?club_id=eq."+clubId+"&user_id=eq."+targetUser,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      await db("club_players?club_id=eq."+clubId+"&user_id=eq."+targetUser,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:null,is_active:false,is_payer:false,is_beneficiary:false})});
      await normalizeTreasureRoles(clubId);return reply({ok:true});
    }
    if(action==="leave_club"){
      if(m.role==="owner")return reply({ok:false,error:"owner_cannot_leave"},409);
      await db("club_members?club_id=eq."+clubId+"&user_id=eq."+user.id,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      await db("club_players?club_id=eq."+clubId+"&user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:null,is_active:false,is_payer:false,is_beneficiary:false})});
      await normalizeTreasureRoles(clubId);return reply({ok:true});
    }
    if(action==="save_board"){
      const patch:any={updated_by:user.id};
      if(body.started!==undefined)patch.started=ints(body.started);
      if(body.current_adventure!==undefined)patch.current_adventure=Math.max(0,Number(body.current_adventure)||0);
      if(body.adventure_locked!==undefined)patch.adventure_locked=body.adventure_locked===true;
      await db("club_board_state?club_id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});return reply({ok:true});
    }
    if(action==="request_collect"){
      const club=(await db("clubs?id=eq."+clubId+"&select=treasure_enabled"))?.[0];if(!club?.treasure_enabled)return reply({ok:false,error:"treasure_disabled"},409);
      const playerId=uuid(body.player_id),player=(await db("club_players?id=eq."+playerId+"&club_id=eq."+clubId+"&is_beneficiary=eq.true&is_payer=eq.false&select=id,user_id,display_name"))?.[0];
      if(!player)return reply({ok:false,error:"beneficiary_not_found"},404);if(!manager(m)&&player.user_id!==user.id)return reply({ok:false,error:"not_authorized"},403);
      const balance=await clubBalance(clubId,playerId);if(balance<1000)return reply({ok:false,error:"threshold_not_met",balance},409);
      const existing=await db("club_collect_requests?club_id=eq."+clubId+"&beneficiary_player_id=eq."+playerId+"&status=eq.pending&select=id,created_at");
      if(existing?.[0])return reply({ok:true,already_requested:true,balance,requested_at:existing[0].created_at});
      const row=(await db("club_collect_requests",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({club_id:clubId,requested_by:user.id,beneficiary_player_id:playerId})}))?.[0];
      const payer=(await db("club_players?club_id=eq."+clubId+"&is_payer=eq.true&is_active=eq.true&select=display_name,sl_username&limit=1"))?.[0]||null;
      return reply({ok:true,balance,request:row,payer});
    }
    if(action==="mark_paid"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      try{
        const remaining=await db("rpc/allocate_club_payment",{method:"POST",body:JSON.stringify({p_club_id:clubId,p_handler:user.id})});
        return reply({ok:true,paid:1000,remaining_balance:Number(remaining||0)});
      }catch(e){const message=String((e as Error)?.message||e);if(message.includes("threshold_not_met"))return reply({ok:false,error:"threshold_not_met"},409);if(message.includes("beneficiary_not_found"))return reply({ok:false,error:"beneficiary_not_found"},409);throw e}
    }
    if(action==="start_adventure"){
      const adventureId=Number(body.adventure_id);if(!Number.isSafeInteger(adventureId)||adventureId<1||adventureId>127)return reply({ok:false,error:"bad_adventure"},400);
      const stampIds=ints(body.stamp_ids);if(stampIds.length!==3)return reply({ok:false,error:"three_stamps_required"},400);
      const refs=stampRefs(body.stamps,stampIds);if(refs.length!==3)return reply({ok:false,error:"invalid_stamp_references"},400);
      const run=(await db("club_adventure_runs?on_conflict=club_id,adventure_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({club_id:clubId,adventure_id:adventureId,status:"active",locked:true,started_by:user.id,completed_at:null,stamp_ids:stampIds,stamp_refs:refs})}))?.[0];
      const chosen=Array.isArray(body.player_ids)?body.player_ids.map(uuid).filter(Boolean):[];const active=await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&select=id");
      const allowed=new Set<string>(active.map((p:any)=>p.id));const playerIds:string[]=[...new Set<string>((chosen.length?chosen:active.map((p:any)=>p.id)).filter((id:string)=>allowed.has(id)))];if(!playerIds.length)return reply({ok:false,error:"participant_required"},400);
      await db("club_run_participants?run_id=eq."+run.id,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      if(playerIds.length)await db("club_run_participants",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(playerIds.map((player_id:string)=>({run_id:run.id,player_id})))});
      const board=(await db("club_board_state?club_id=eq."+clubId+"&select=started"))?.[0]||{};
      await db("club_board_state?club_id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({started:[...new Set([...(board.started||[]),adventureId])],current_adventure:adventureId,adventure_locked:true,updated_by:user.id})});
      return reply({ok:true,run_id:run.id,participants:playerIds.length,finalized:await finalizeRun(clubId,adventureId)});
    }
    if(action==="set_stamp"){
      const playerId=uuid(body.player_id),stampId=Number(body.stamp_id);if(!playerId||!Number.isSafeInteger(stampId)||stampId<1)return reply({ok:false,error:"bad_stamp"},400);
      const player=(await db("club_players?id=eq."+playerId+"&club_id=eq."+clubId+"&select=id,user_id"))?.[0];
      if(!player)return reply({ok:false,error:"player_not_found"},404);
      if(player.user_id&&player.user_id!==user.id)return reply({ok:false,error:"own_stamps_only"},403);
      if(!player.user_id&&!manager(m))return reply({ok:false,error:"manager_required_for_guest"},403);
      if(body.completed===false)await db("club_stamp_progress?club_id=eq."+clubId+"&player_id=eq."+playerId+"&stamp_id=eq."+stampId,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      else await db("club_stamp_progress?on_conflict=club_id,player_id,stamp_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({club_id:clubId,player_id:playerId,stamp_id:stampId,source:body.source==="stafi"?"stafi":"manual",completed_by:user.id})});
      const adventureId=Number(body.adventure_id),finalized=Number.isSafeInteger(adventureId)&&adventureId>0?await finalizeRun(clubId,adventureId):null;
      return reply({ok:true,finalized});
    }
    return reply({ok:false,error:"unknown_action"},400);
  }catch(e){const message=String((e as Error)?.message||e);console.error(message);const known=["not_a_club_member"];return reply({ok:false,error:known.includes(message)?message:"server_error"},known.includes(message)?403:500)}
});
