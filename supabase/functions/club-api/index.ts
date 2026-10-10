import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPA_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-bbb-job-secret",
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
  if(!Array.isArray(value)||ids.length<1||ids.length>3||value.length!==ids.length)return [];
  const allowed=new Set(ids),seen=new Set<number>(),out:any[]=[];
  for(const item of value){
    const id=Number(item?.id),name=cleanText(item?.name,180),region=cleanText(item?.region,128),x=Number(item?.x),y=Number(item?.y),z=Number(item?.z);
    if(!Number.isSafeInteger(id)||!allowed.has(id)||seen.has(id)||!name||!region||![x,y,z].every(Number.isFinite)||x<0||x>256||y<0||y>256||z<0||z>10000)return [];
    seen.add(id);out.push({id,name,region,x:Math.round(x),y:Math.round(y),z:Math.round(z)});
  }
  return out;
}
function decodeHtml(s:string){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g," ").toLowerCase()}
// Only explicit named rows on the collected detail page are positive evidence.
// Summary prose, navigation links and absence from any list are never evidence.
function stafiCollectedEvidence(page:any,collected=true){
  if(new URL(page.url).pathname.toLowerCase()!==(collected?"/utils/collectedstamps.php":"/utils/notcollectedstamps.php"))throw new Error("stafi_evidence_unavailable");
  const html=page.html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,"");
  const sections=[...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  const label=collected?/^(my |your )?collected stamps(?:\s*:.*)?$|^stamps you have$/:/^(currently available )?(not collected|uncollected) stamps(?:\s*:.*)?$|^stamps you need$/;
  const heading=sections.find(m=>label.test(decodeHtml(m[1]).trim()));
  // Accept explicit stamp rows when BBB omits the expected heading.
  const start=heading?Number(heading.index)+heading[0].length:0,next=heading?sections.find(m=>Number(m.index)>=start):null;
  const collectedHtml=html.slice(start,next?.index);
  const evidence=new Map<string,Set<string>>();
  for(const row of collectedHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const text=decodeHtml(row[1]);if(collected&&/uncollected|not (?:yet )?collected|still needed/.test(text))continue;
    const keys=stafiUncollectedLocations(row[1]);if(keys.size!==1)continue;
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>decodeHtml(m[1]).trim()).filter(Boolean);
    const key=[...keys][0],names=evidence.get(key)||new Set<string>();
    for(const cell of cells)names.add(cell);evidence.set(key,names);
  }
  return evidence;
}
function stafiHasEvidence(evidence:Map<string,Set<string>>,ref:any){
  return !!evidence.get(stafiLocationKey(ref.region,ref.x,ref.y,ref.z))?.has(decodeHtml(String(ref.name||"")).trim());
}
function stafiSummary(text:string){
  const get=(re:RegExp)=>{
    const values=[...text.matchAll(new RegExp(re.source,"gi"))].map(m=>Number(m[1]));
    return values.length&&values.every(n=>Number.isSafeInteger(n)&&n>=0)&&new Set(values).size===1?values[0]:null;
  };
  const currentUncollected=get(/currently available uncollected stamps?\s*:\s*(\d+)/i);
  const currentAvailable=get(/all currently available stamps?\s*:\s*(\d+)/i);
  let uncollected=currentUncollected;
  if(uncollected===null)uncollected=get(/uncollected stamps?\s*:\s*(\d+)/i);
  let rawCollected=get(/my collected stamps?\s*:\s*(\d+)/i);
  if(rawCollected===null)rawCollected=get(/(?<!un)\bcollected stamps?\s*:\s*(\d+)/i);
  let available=currentAvailable;
  if(available===null)available=get(/available stamps?\s*:\s*(\d+)/i);
  if(available===null&&rawCollected!==null&&uncollected!==null)available=rawCollected+uncollected;
  if(uncollected===null&&available!==null&&rawCollected!==null&&available>=rawCollected)uncollected=available-rawCollected;
  const activeCollected=currentAvailable!==null&&currentUncollected!==null&&currentAvailable>=currentUncollected
    ?currentAvailable-currentUncollected
    :null;
  return {raw_collected:rawCollected,uncollected,available,active_collected:activeCollected,current_available:currentAvailable,current_uncollected:currentUncollected};
}
function stafiLocationKey(region:unknown,x:unknown,y:unknown,z:unknown){
  const r=String(region||"").trim().toLowerCase(),values=[x,y,z];
  if(!r||values.some(v=>v===null||v===undefined||String(v).trim()===""))return "";
  const [nx,ny,nz]=values.map(Number);
  return [nx,ny,nz].every(Number.isSafeInteger)&&nx>=0&&nx<=256&&ny>=0&&ny<=256&&nz>=0&&nz<=10000?[r,nx,ny,nz].join("|"):"";
}
function stafiUncollectedLocations(html:string){
  const out=new Set<string>();
  for(const m of html.matchAll(/https?:\/\/maps\.secondlife\.com\/secondlife\/[^\\"'<>\s]+/gi)){
    try{
      const u=new URL(m[0].replace(/&amp;/gi,"&")),p=u.pathname.split("/").filter(Boolean);
      const i=p.findIndex(x=>x.toLowerCase()==="secondlife");if(i<0||p.length<i+5)continue;
      const key=stafiLocationKey(decodeURIComponent(p[i+1]),p[i+2],p[i+3],p[i+4]);if(key)out.add(key);
    }catch{}
  }
  return out;
}
async function fetchStaFiUrl(url:string){
  for(let hops=0;hops<4;hops++){
    const r=await fetch(url,{redirect:"manual",headers:{Accept:"text/html,text/plain;q=0.9","User-Agent":"BBB-Passport-Adventures/1.0"},signal:AbortSignal.timeout(12000)});
    if(r.status>=300&&r.status<400){
      const next=r.headers.get("location");if(!next)throw new Error("stafi_redirect_failed");
      const candidate=new URL(next,url),host=candidate.hostname.toLowerCase(),path=candidate.pathname.toLowerCase();
      if(!(host==="thebbbbug.com"||host==="www.thebbbbug.com")||!path.startsWith("/utils/"))throw new Error("stafi_redirect_blocked");
      url=candidate.toString();continue;
    }
    if(!r.ok)throw new Error("stafi_http_"+r.status);
    const length=Number(r.headers.get("content-length")||0);if(length>2_000_000)throw new Error("stafi_page_too_large");
    const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.byteLength>2_000_000)throw new Error("stafi_page_too_large");
    const html=new TextDecoder().decode(bytes);return {url,html,text:decodeHtml(html)};
  }
  throw new Error("stafi_too_many_redirects");
}
async function fetchStaFi(raw:string){
  const url=stafiUrl(raw);if(!url)throw new Error("invalid_stafi_url");
  return await fetchStaFiUrl(url);
}
async function fetchStaFiDetail(summaryUrl:string,path:string){
  const base=new URL(summaryUrl),host=base.hostname.toLowerCase();
  if(!(host==="thebbbbug.com"||host==="www.thebbbbug.com"))throw new Error("stafi_redirect_blocked");
  if(!["/UTILS/NotCollectedStamps.php","/UTILS/CollectedStamps.php","/UTILS/CurrentStamps.php"].includes(path))throw new Error("stafi_redirect_blocked");
  base.pathname=path;base.hash="";
  return await fetchStaFiUrl(base.toString());
}

async function db(path:string,init:RequestInit={}){
  const h=new Headers(init.headers||{});h.set("apikey",SERVICE);h.set("Authorization","Bearer "+SERVICE);
  if(init.body&&!h.has("Content-Type"))h.set("Content-Type","application/json");
  const r=await fetch(SUPA_URL+"/rest/v1/"+path,{...init,headers:h});
  const t=await r.text();if(!r.ok){
    const error=new Error("db_"+r.status) as Error&{dbMessage?:string};
    try{error.dbMessage=JSON.parse(t)?.message}catch{}
    throw error;
  }
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
async function treasurePlayers(clubId:string){
  return await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&select=id,user_id,display_name,sl_username,is_payer,is_beneficiary,sort_order,created_at&order=sort_order.asc,created_at.asc");
}
async function clearTreasureRoles(clubId:string){
  await db("club_players?club_id=eq."+clubId+"&is_payer=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:false})});
  await db("club_players?club_id=eq."+clubId+"&is_beneficiary=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:false})});
}
async function assignTreasurePayer(clubId:string,userId:string){
  const players=await treasurePlayers(clubId),payer=players.find((p:any)=>p.user_id===userId);
  if(!payer)throw new Error("active_player_required");
  const beneficiary=players.find((p:any)=>p.id!==payer.id)||null;
  await clearTreasureRoles(clubId);
  await db("club_players?id=eq."+payer.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_payer:true,is_beneficiary:false})});
  if(beneficiary)await db("club_players?id=eq."+beneficiary.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:true,is_payer:false})});
  return {payer,beneficiary};
}
async function ensureTreasureRecipient(clubId:string){
  const players=await treasurePlayers(clubId),payer=players.find((p:any)=>p.is_payer);
  if(!payer)return null;
  let beneficiary=players.find((p:any)=>p.is_beneficiary&&p.id!==payer.id)||null;
  if(!beneficiary){
    beneficiary=players.find((p:any)=>p.id!==payer.id)||null;
    if(beneficiary)await db("club_players?id=eq."+beneficiary.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:true,is_payer:false})});
  }
  return {payer,beneficiary};
}
async function clubBalance(clubId:string,beneficiaryId=""){
  const suffix=beneficiaryId?"&beneficiary_player_id=eq."+beneficiaryId:"";
  const rows=await db("club_rewards?club_id=eq."+clubId+suffix+"&select=amount,paid_amount");
  return rows.reduce((sum:number,row:any)=>sum+rewardRemaining(row),0);
}
async function finalizeRun(clubId:string,adventureId:number){
  // Eligibility, completion, reward and Current cleanup share one DB transaction.
  return await db("rpc/finalize_club_adventure",{method:"POST",body:JSON.stringify({p_club_id:clubId,p_adventure_id:adventureId})});
}
async function loadClub(clubId:string,userId:string){
  const m=await requireMember(clubId,userId);
  const runs=await db("club_adventure_runs?club_id=eq."+clubId+"&select=*&order=started_at.asc");
  const runIds=runs.map((x:any)=>x.id);
  const [clubs,members,players,boards,participants,stamps,extraStamps,rewards,collectRequests,runtimeRows]=await Promise.all([
    db("clubs?id=eq."+clubId+"&select=id,name,slug,owner_id,game_mode,treasure_enabled,payout_threshold,is_legacy,created_at,updated_at"),
    db("club_members?club_id=eq."+clubId+"&select=user_id,role,joined_at&order=joined_at.asc"),
    db("club_players?club_id=eq."+clubId+"&select=id,user_id,display_name,sl_username,sort_order,is_active,is_payer,is_beneficiary,stafi_collected_count,stafi_available_count,stafi_last_success_at,created_at,updated_at&order=sort_order.asc,created_at.asc"),
    db("club_board_state?club_id=eq."+clubId+"&select=*"),
    runIds.length?db("club_run_participants?select=run_id,player_id,joined_at&run_id=in.("+runIds.join(",")+")"):Promise.resolve([]),
    db("club_stamp_progress?club_id=eq."+clubId+"&select=player_id,stamp_id,source,completed_at"),
    db("club_stafi_location_evidence?club_id=eq."+clubId+"&select=player_id,location_key,name,region,x,y,z,source,collected,completed_at"),
    db("club_rewards?club_id=eq."+clubId+"&select=*&order=awarded_at.desc"),
    db("club_collect_requests?club_id=eq."+clubId+"&select=*&order=created_at.desc&limit=50"),
    db("app_runtime_state?id=eq.1&select=passport_available_count,updated_at")
  ]);
  return {club:clubs?.[0],membership:m,members,players,board:boards?.[0],runs,participants,stamps,extra_stamps:extraStamps,rewards,collect_requests:collectRequests,passport_total:Number(runtimeRows?.[0]?.passport_available_count||0)||null};
}

async function syncStaFi(userId:string,clubId:string,force=false){
  const settings=(await db("user_private_settings?user_id=eq."+userId+"&select=stafi_url,stafi_sync_enabled,stafi_verified_at"))?.[0];
  if(!settings?.stafi_url)return {enabled:false,error:"stafi_url_required",imported:0,checked:0};
  if(!force&&!settings.stafi_sync_enabled)return {enabled:false,error:"stafi_sync_disabled",imported:0,checked:0};

  const player=(await db("club_players?club_id=eq."+clubId+"&user_id=eq."+userId+"&is_active=eq.true&select=id"))?.[0];
  if(!player)return {enabled:!!settings.stafi_sync_enabled,verified:false,error:"linked_player_required",imported:0,checked:0};

  const [board,club]=await Promise.all([
    db("club_board_state?club_id=eq."+clubId+"&select=current_adventure"),
    db("clubs?id=eq."+clubId+"&select=game_mode")
  ]);
  const currentAdventure=Number(board?.[0]?.current_adventure||0),mode=String(club?.[0]?.game_mode||"group");
  let runs:any[]=[];
  if(mode==="babygirl"){
    runs=await db("club_adventure_runs?club_id=eq."+clubId+"&status=eq.active&select=id,adventure_id,stamp_ids,stamp_refs&order=started_at.asc");
  }else if(Number.isSafeInteger(currentAdventure)&&currentAdventure>0){
    const run=(await db("club_adventure_runs?club_id=eq."+clubId+"&adventure_id=eq."+currentAdventure+"&status=eq.active&select=id,adventure_id,stamp_ids,stamp_refs&limit=1"))?.[0];
    if(run)runs=[run];
  }
  if(!force&&!runs.length)return {enabled:true,verified:!!settings.stafi_verified_at,imported:0,checked:0,skipped:"no_active_adventure"};

  const now=new Date().toISOString();
  try{
    const page=await fetchStaFi(settings.stafi_url),summary=stafiSummary(page.text);
    const collectedPage=await fetchStaFiDetail(page.url,"/UTILS/CollectedStamps.php");
    const evidence=stafiCollectedEvidence(collectedPage);
    let missingEvidence=new Map<string,Set<string>>();
    try{missingEvidence=stafiCollectedEvidence(await fetchStaFiDetail(page.url,"/UTILS/NotCollectedStamps.php"),false)}catch{}
    // Global collected includes retired stamps, so it may exceed active available.
    // Contradictory active counts are not counter data; explicit rows still count.
    const countsConsistent=summary.current_available!==null&&summary.current_uncollected!==null
      &&summary.current_uncollected<=summary.current_available
      &&(summary.raw_collected===null||Number(summary.active_collected)<=summary.raw_collected);
    const activeAvailable=countsConsistent?summary.current_available:null;
    const activeCollected=countsConsistent?summary.active_collected:null;
    const countPatch:any={};
    if(activeAvailable!==null){
      await db("app_runtime_state?id=eq.1",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({passport_available_count:activeAvailable,updated_at:now})});
      countPatch.stafi_available_count=activeAvailable;
      countPatch.stafi_uncollected_count=summary.current_uncollected;
    }
    if(activeCollected!==null)countPatch.stafi_last_stamp_count=activeCollected;
    const playerPatch:any={stafi_last_success_at:now};
    if(activeCollected!==null)playerPatch.stafi_collected_count=activeCollected;
    if(activeAvailable!==null)playerPatch.stafi_available_count=activeAvailable;
    await db("club_players?club_id=eq."+clubId+"&id=eq."+player.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(playerPatch)});

    // Only explicit evidence enters the new index. Never backfill the legacy
    // inferred table or replace/delete progress when a response is incomplete.
    const catalogRow=(await db("bbb_catalog_cache?select=data&limit=1"))?.[0];
    const catalogItems=Array.isArray(catalogRow?.data?.items)?catalogRow.data.items:[];
    const locations=new Map<string,any[]>();
    for(const item of catalogItems){
      const key=stafiLocationKey(item.region,item.x,item.y,item.z);
      if(key){const items=locations.get(key)||[];items.push(item);locations.set(key,items)}
    }
    const extraRows:any[]=[];
    for(const [key,items] of locations){
      // A location is not a stamp identity if multiple catalog stops share it.
      if(items.length!==1)continue;
      const it=items[0],collected=stafiHasEvidence(evidence,it);
      if(!collected&&!stafiHasEvidence(missingEvidence,it))continue;
      extraRows.push({club_id:clubId,player_id:player.id,location_key:key,name:String(it.name),region:String(it.region),x:Math.round(Number(it.x)),y:Math.round(Number(it.y)),z:Math.round(Number(it.z)),source:"stafi_explicit",collected,completed_at:now});
    }
    if(extraRows.length)await db("club_stafi_location_evidence?on_conflict=club_id,player_id,location_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(extraRows)});

    const existing=await db("club_stamp_progress?club_id=eq."+clubId+"&player_id=eq."+player.id+"&select=stamp_id,source");
    const completed=new Map<number,string>(existing.map((p:any)=>[Number(p.stamp_id),String(p.source)])),rows:any[]=[],checked:number[]=[];
    const processedRuns:number[]=[];
    const identities=new Map<string,Set<number>>();
    const identity=(ref:any)=>stafiLocationKey(ref.region,ref.x,ref.y,ref.z)+"|"+decodeHtml(String(ref.name||"")).trim();
    for(const run of runs)for(const ref of Array.isArray(run.stamp_refs)?run.stamp_refs:[]){
      const key=identity(ref),ids=identities.get(key)||new Set<number>();ids.add(Number(ref.id));identities.set(key,ids);
    }
    for(const run of runs){
      const participating=(await db("club_run_participants?run_id=eq."+run.id+"&player_id=eq."+player.id+"&select=player_id"))?.[0];
      if(!participating)continue;
      processedRuns.push(Number(run.adventure_id));
      for(const ref of Array.isArray(run.stamp_refs)?run.stamp_refs:[]){
        const id=Number(ref.id);
        if(!Number.isSafeInteger(id)||completed.get(id)==="stafi")continue;
        checked.push(id);
        const sameName=(locations.get(stafiLocationKey(ref.region,ref.x,ref.y,ref.z))||[]).filter(it=>identity(it)===identity(ref));
        if((identities.get(identity(ref))?.size||0)<=1&&sameName.length<=1&&stafiHasEvidence(evidence,ref)){
          rows.push({club_id:clubId,player_id:player.id,stamp_id:id,source:"stafi",completed_by:userId});
          completed.set(id,"stafi");
        }
      }
    }
    if(rows.length)await db("club_stamp_progress?on_conflict=club_id,player_id,stamp_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});

    const status={stafi_sync_enabled:true,stafi_verified_at:now,stafi_last_sync_at:now,stafi_last_success_at:now,stafi_last_error:null,...countPatch};
    await db("user_private_settings?user_id=eq."+userId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(status)});
    for(const adventureId of processedRuns)await finalizeRun(clubId,adventureId);
    return {enabled:true,verified:true,imported:rows.length,checked:[...new Set(checked)].length,total:status.stafi_last_stamp_count,summary,current_adventure:currentAdventure,processed_adventures:processedRuns,location_indexed:0,collected_location_indexed:evidence.size,extra_location_mapped:extraRows.length,location_list_trusted:true};
  }catch(e){
    const raw=String((e as Error)?.message||e),safe=/^(invalid_stafi_url|stafi_redirect_failed|stafi_redirect_blocked|stafi_http_\d{3}|stafi_page_too_large|stafi_too_many_redirects|stafi_evidence_unavailable|linked_player_required)$/.test(raw)?raw:"stafi_unavailable";
    await db("user_private_settings?user_id=eq."+userId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({stafi_last_sync_at:now,stafi_last_error:safe})});
    return {enabled:!!settings.stafi_sync_enabled,verified:false,error:safe,imported:0,checked:0,current_adventure:currentAdventure};
  }
}

async function scheduledStaFiRefresh(){
  const cutoff=encodeURIComponent(new Date(Date.now()-10*60*1000).toISOString());
  const boards=await db("club_board_state?last_active_at=gte."+cutoff+"&current_adventure=gt.0&select=club_id,current_adventure,last_active_at&limit=100");
  let users=0,clubsChecked=0,imported=0,errors=0,passportTotal=0,locationIndexedMax=0,locationTrustedUsers=0;
  const seenPairs=new Set<string>();
  for(const board of boards||[]){
    const clubId=uuid(board.club_id),adventureId=Number(board.current_adventure||0);
    if(!clubId||!Number.isSafeInteger(adventureId)||adventureId<1)continue;
    const active=(await db("club_adventure_runs?club_id=eq."+clubId+"&adventure_id=eq."+adventureId+"&status=eq.active&select=id&limit=1"))?.[0];
    if(!active)continue;
    const players=await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&user_id=not.is.null&select=user_id");
    let touched=false;
    for(const p of players||[]){
      const userId=uuid(p.user_id);if(!userId)continue;
      const pair=userId+":"+clubId;if(seenPairs.has(pair))continue;seenPairs.add(pair);
      const out=await syncStaFi(userId,clubId,false);
      if(out.error==="stafi_sync_disabled"||out.error==="stafi_url_required")continue;
      touched=true;users++;imported+=Number(out.imported||0);if(out.error)errors++;
      locationIndexedMax=Math.max(locationIndexedMax,Number(out.location_indexed||0));if(out.location_list_trusted)locationTrustedUsers++;
      passportTotal=Math.max(passportTotal,Number(out.summary?.current_available??out.summary?.available??0));
    }
    if(touched)clubsChecked++;
  }
  return {users,clubs_checked:clubsChecked,imported,errors,passport_total:passportTotal,location_indexed_max:locationIndexedMax,location_trusted_users:locationTrustedUsers,active_window_minutes:10,at:new Date().toISOString()};
}
async function validJobSecret(req:Request){
  const supplied=req.headers.get("x-bbb-job-secret")||"";
  if(supplied.length<32)return false;
  const row=(await db("internal_job_config?name=eq.stafi-cron&select=secret"))?.[0];
  return !!row?.secret&&row.secret===supplied;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return reply({ok:false,error:"post_required"},405);
  let body:any={};try{body=await req.json()}catch{}
  const action=String(body.action||"list");
  try{
    if(action==="cron_stafi_refresh"){
      if(!await validJobSecret(req))return reply({ok:false,error:"job_forbidden"},403);
      return reply({ok:true,...await scheduledStaFiRefresh()});
    }
    const user=await currentUser(req);if(!user?.id)return reply({ok:false,error:"sign_in_required"},401);
    if(action==="list"){
      const memberships=await db("club_members?user_id=eq."+user.id+"&select=club_id,role,joined_at&order=joined_at.asc");
      const ids=memberships.map((m:any)=>m.club_id);
      const clubs=ids.length?await db("clubs?id=in.("+ids.join(",")+")&select=id,name,slug,owner_id,game_mode,treasure_enabled,payout_threshold,is_legacy,created_at,updated_at"):[];
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=user_id,display_name,sl_username"))?.[0]||null;
      const privateSettings=(await db("user_private_settings?user_id=eq."+user.id+"&select=stafi_url,stafi_sync_enabled,stafi_verified_at,stafi_last_sync_at,stafi_last_success_at,stafi_last_error,stafi_last_stamp_count,stafi_uncollected_count,stafi_available_count"))?.[0]||null;
      const runtime=(await db("app_runtime_state?id=eq.1&select=passport_available_count"))?.[0]||null;
      return reply({ok:true,user:{id:user.id,sl_username:user.sl_username,display_name:user.display_name},profile,private_settings:privateSettings,passport_total:Number(runtime?.passport_available_count||0)||null,clubs:clubs.map((c:any)=>({...c,role:memberships.find((m:any)=>m.club_id===c.id)?.role||"member"}))});
    }
    if(action==="load")return reply({ok:true,...await loadClub(uuid(body.club_id),user.id)});

    if(action==="update_profile"){
      const display=cleanText(body.display_name,60);if(!display)return reply({ok:false,error:"display_name_required"},400);
      const sl=user.sl_username;
      const stafi=body.stafi_url===undefined?undefined:(body.stafi_url?stafiUrl(body.stafi_url):null);if(body.stafi_url&&!stafi)return reply({ok:false,error:"invalid_stafi_url"},400);
      const rows=await db("profiles?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({display_name:display,sl_username:sl})});
      await db("club_players?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({display_name:display,sl_username:sl})});
      if(stafi!==undefined){const current=(await db("user_private_settings?user_id=eq."+user.id+"&select=stafi_url"))?.[0];const changed=(current?.stafi_url||null)!==stafi;await db("user_private_settings?on_conflict=user_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,stafi_url:stafi,...(changed?{stafi_sync_enabled:false,stafi_verified_at:null,stafi_last_error:null,stafi_last_stamp_count:null,stafi_uncollected_count:null,stafi_available_count:null}:{})})});if(changed)await db("club_players?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({stafi_collected_count:null,stafi_available_count:null,stafi_last_success_at:null})})}
      return reply({ok:true,profile:rows?.[0]});
    }

    if(action==="create"){
      const name=cleanText(body.name,80);if(!name)return reply({ok:false,error:"club_name_required"},400);
      const mode=String(body.game_mode||"solo");
      if(!["solo","babygirl","group"].includes(mode))return reply({ok:false,error:"game_mode_not_available"},409);
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=display_name,sl_username"))?.[0]||{};
      const code=randomCode(),clubId=crypto.randomUUID(),babygirl=mode==="babygirl";
      const club=(await db("clubs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id:clubId,name,slug:randomSlug(name),owner_id:user.id,join_code_hash:await sha256(code),game_mode:mode,treasure_enabled:babygirl})}))?.[0];
      await db("club_members",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,user_id:user.id,role:"owner"})});
      await db("club_players",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,user_id:user.id,display_name:profile.display_name||"Adventurer",sl_username:profile.sl_username||null,sort_order:1,is_payer:babygirl,is_beneficiary:false,claimed_at:new Date().toISOString()})});
      await db("club_board_state",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({club_id:clubId,updated_by:user.id})});
      return reply({ok:true,club,join_code:mode==="solo"?null:code});
    }

    if(action==="join"){
      const code=cleanText(body.join_code,40).toUpperCase();if(code.length<8)return reply({ok:false,error:"bad_join_code"},400);
      const limiter=(await db("profiles?user_id=eq."+user.id+"&select=join_attempts,join_window_started_at"))?.[0]||{};
      const windowStart=limiter.join_window_started_at?new Date(limiter.join_window_started_at).getTime():0,inside=windowStart&&Date.now()-windowStart<10*60*1000,attempts=inside?Math.max(0,Number(limiter.join_attempts||0)):0;
      if(attempts>=20)return reply({ok:false,error:"join_rate_limited"},429);
      await db("profiles?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_attempts:attempts+1,join_window_started_at:inside?limiter.join_window_started_at:new Date().toISOString()})});
      const clubs=await db("clubs?join_code_hash=eq."+await sha256(code)+"&select=id,name,game_mode");const club=clubs?.[0];
      if(!club)return reply({ok:false,error:"join_code_not_found"},404);
      const already=await membership(club.id,user.id);
      if(!already){
        if(club.game_mode==="solo")return reply({ok:false,error:"solo_club_no_invites"},409);
        const activePlayers=await db("club_players?club_id=eq."+club.id+"&is_active=eq.true&select=id");
        if(club.game_mode==="babygirl"&&activePlayers.length>=2)return reply({ok:false,error:"babygirl_full"},409);
      }
      const profile=(await db("profiles?user_id=eq."+user.id+"&select=display_name,sl_username"))?.[0]||{};
      await db("club_members?on_conflict=club_id,user_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({club_id:club.id,user_id:user.id,role:"member"})});
      await db("club_players?on_conflict=club_id,user_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({club_id:club.id,user_id:user.id,display_name:profile.display_name||"Adventurer",sl_username:profile.sl_username||user.sl_username,sort_order:100,claimed_at:new Date().toISOString()})});
      const joinedClub=(await db("clubs?id=eq."+club.id+"&select=game_mode,treasure_enabled"))?.[0];
      if(joinedClub?.game_mode==="babygirl"&&joinedClub?.treasure_enabled)await ensureTreasureRecipient(club.id);
      await db("profiles?user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_attempts:0,join_window_started_at:null})});
      return reply({ok:true,club_id:club.id,club_name:club.name});
    }

    const clubId=uuid(body.club_id);if(!clubId)return reply({ok:false,error:"club_required"},400);
    const m=await requireMember(clubId,user.id);

    if(action==="activity"){
      await db("club_board_state?club_id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_active_at:new Date().toISOString()})});
      return reply({ok:true});
    }
    if(action==="verify_stafi"||action==="sync_stafi")return reply({ok:true,...await syncStaFi(user.id,clubId,action==="verify_stafi")});

    if(action==="rotate_invite"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      const club=(await db("clubs?id=eq."+clubId+"&select=game_mode"))?.[0];
      if(club?.game_mode==="solo")return reply({ok:false,error:"solo_club_no_invites"},409);
      if(club?.game_mode==="babygirl"){
        const active=await db("club_players?club_id=eq."+clubId+"&is_active=eq.true&select=id");
        if(active.length>=2)return reply({ok:false,error:"babygirl_full"},409);
      }
      const code=randomCode();await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({join_code_hash:await sha256(code)})});
      return reply({ok:true,join_code:code});
    }
    if(action==="update_club"){
      if(!manager(m))return reply({ok:false,error:"manager_required"},403);
      if(body.game_mode!==undefined)return reply({ok:false,error:"game_mode_locked"},409);
      if(body.treasure_enabled!==undefined)return reply({ok:false,error:"treasure_managed_by_mode"},409);
      const patch:any={};
      if(body.name!==undefined){
        patch.name=cleanText(body.name,80);if(!patch.name)return reply({ok:false,error:"club_name_required"},400);
      }
      if(!Object.keys(patch).length)return reply({ok:true});
      await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
      return reply({ok:true});
    }
    if(action==="set_treasure_recipient"){
      const club=(await db("clubs?id=eq."+clubId+"&select=treasure_enabled"))?.[0];
      if(!club?.treasure_enabled)return reply({ok:false,error:"treasure_disabled"},409);
      const payer=(await db("club_players?club_id=eq."+clubId+"&user_id=eq."+user.id+"&is_active=eq.true&is_payer=eq.true&select=id"))?.[0];
      if(!payer)return reply({ok:false,error:"treasure_locked_to_payer"},403);
      const beneficiaryId=uuid(body.beneficiary_player_id);
      if(!beneficiaryId||beneficiaryId===payer.id)return reply({ok:false,error:"beneficiary_required"},400);
      const beneficiary=(await db("club_players?id=eq."+beneficiaryId+"&club_id=eq."+clubId+"&is_active=eq.true&select=id"))?.[0];
      if(!beneficiary)return reply({ok:false,error:"beneficiary_required"},400);
      await db("club_players?club_id=eq."+clubId+"&is_beneficiary=eq.true",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:false})});
      await db("club_players?id=eq."+beneficiary.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({is_beneficiary:true,is_payer:false})});
      return reply({ok:true,beneficiary_player_id:beneficiary.id});
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
      const targetPlayer=(await db("club_players?club_id=eq."+clubId+"&user_id=eq."+targetUser+"&select=id,is_payer"))?.[0];
      await db("club_members?club_id=eq."+clubId+"&user_id=eq."+targetUser,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      await db("club_players?club_id=eq."+clubId+"&user_id=eq."+targetUser,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:null,is_active:false,is_payer:false,is_beneficiary:false})});
      if(targetPlayer?.is_payer){await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({treasure_enabled:false})});await clearTreasureRoles(clubId)}
      else await ensureTreasureRecipient(clubId);
      return reply({ok:true});
    }
    if(action==="leave_club"){
      if(m.role==="owner")return reply({ok:false,error:"owner_cannot_leave"},409);
      const leavingPlayer=(await db("club_players?club_id=eq."+clubId+"&user_id=eq."+user.id+"&select=id,is_payer"))?.[0];
      await db("club_members?club_id=eq."+clubId+"&user_id=eq."+user.id,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      await db("club_players?club_id=eq."+clubId+"&user_id=eq."+user.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:null,is_active:false,is_payer:false,is_beneficiary:false})});
      if(leavingPlayer?.is_payer){await db("clubs?id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({treasure_enabled:false})});await clearTreasureRoles(clubId)}
      else await ensureTreasureRecipient(clubId);
      return reply({ok:true});
    }
    if(action==="save_board"){
      if(body.started!==undefined||body.current_adventure!==undefined)return reply({ok:false,error:"adventure_state_managed_by_backend"},409);
      const patch:any={updated_by:user.id,last_active_at:new Date().toISOString()};
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
      const payer=(await db("club_players?club_id=eq."+clubId+"&user_id=eq."+user.id+"&is_active=eq.true&is_payer=eq.true&select=id"))?.[0];
      if(!payer)return reply({ok:false,error:"payer_required"},403);
      try{
        const remaining=await db("rpc/allocate_club_payment",{method:"POST",body:JSON.stringify({p_club_id:clubId,p_handler:user.id})});
        return reply({ok:true,paid:1000,remaining_balance:Number(remaining||0)});
      }catch(e){const message=String((e as Error&{dbMessage?:string})?.dbMessage||(e as Error)?.message||e);if(message==="threshold_not_met")return reply({ok:false,error:"threshold_not_met"},409);if(message==="beneficiary_not_found")return reply({ok:false,error:"beneficiary_not_found"},409);throw e}
    }
    if(action==="start_adventure"){
      const adventureId=Number(body.adventure_id);if(!Number.isSafeInteger(adventureId)||adventureId<1||adventureId>127)return reply({ok:false,error:"bad_adventure"},400);
      const stampIds=body.stamp_ids;
      if(!Array.isArray(stampIds)||stampIds.length<1||stampIds.length>3||new Set(stampIds).size!==stampIds.length||stampIds.some((id:unknown)=>!Number.isSafeInteger(id)||Number(id)<1||Number(id)>=100000))return reply({ok:false,error:"one_to_three_stamps_required"},400);
      const refs=stampRefs(body.stamps,stampIds);if(refs.length!==stampIds.length)return reply({ok:false,error:"invalid_stamp_references"},400);
      // The RPC validates membership, mode/roster and existing run/board state
      // before changing anything, then snapshots the start in one transaction.
      const started=await db("rpc/start_club_adventure",{method:"POST",body:JSON.stringify({p_club_id:clubId,p_user_id:user.id,p_adventure_id:adventureId,p_stamp_ids:stampIds,p_stamp_refs:refs})});
      return reply({ok:true,...started});
    }
    if(action==="trim_adventure_stamps"){
      const adventureId=Number(body.adventure_id);if(!Number.isSafeInteger(adventureId)||adventureId<1||adventureId>127)return reply({ok:false,error:"bad_adventure"},400);
      const run=(await db("club_adventure_runs?club_id=eq."+clubId+"&adventure_id=eq."+adventureId+"&status=eq.active&select=id,stamp_ids"))?.[0];
      if(!run)return reply({ok:false,error:"active_run_required"},409);
      const oldIds=ints(run.stamp_ids),stampIds=ints(body.stamp_ids);
      if(stampIds.length>3||stampIds.length>=oldIds.length||stampIds.some((id:number)=>!oldIds.includes(id)))return reply({ok:false,error:"invalid_retirement_trim"},400);
      if(!stampIds.length){
        await db("club_adventure_runs?id=eq."+run.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"retired",locked:false,stamp_ids:[],stamp_refs:[]})});
        const board=(await db("club_board_state?club_id=eq."+clubId+"&select=current_adventure"))?.[0];
        if(Number(board?.current_adventure||0)===adventureId)await db("club_board_state?club_id=eq."+clubId,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({current_adventure:0,adventure_locked:true,updated_by:user.id,last_active_at:new Date().toISOString()})});
        return reply({ok:true,retired:true,stamp_ids:[]});
      }
      const refs=stampRefs(body.stamps,stampIds);if(refs.length!==stampIds.length)return reply({ok:false,error:"invalid_stamp_references"},400);
      await db("club_adventure_runs?id=eq."+run.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({stamp_ids:stampIds,stamp_refs:refs})});
      return reply({ok:true,stamp_ids:stampIds,finalized:await finalizeRun(clubId,adventureId)});
    }
    if(action==="set_stamp"){
      const playerId=uuid(body.player_id),stampId=Number(body.stamp_id);if(!playerId||!Number.isSafeInteger(stampId)||stampId<1)return reply({ok:false,error:"bad_stamp"},400);
      const player=(await db("club_players?id=eq."+playerId+"&club_id=eq."+clubId+"&select=id,user_id"))?.[0];
      if(!player)return reply({ok:false,error:"player_not_found"},404);
      if(player.user_id&&player.user_id!==user.id)return reply({ok:false,error:"own_stamps_only"},403);
      if(!player.user_id&&!manager(m))return reply({ok:false,error:"manager_required_for_guest"},403);
      if(body.completed===false){
        const current=(await db("club_stamp_progress?club_id=eq."+clubId+"&player_id=eq."+playerId+"&stamp_id=eq."+stampId+"&select=source"))?.[0];
        if(current&&current.source!=="manual")return reply({ok:false,error:"stafi_stamp_locked"},409);
        await db("club_stamp_progress?club_id=eq."+clubId+"&player_id=eq."+playerId+"&stamp_id=eq."+stampId+"&source=eq.manual",{method:"DELETE",headers:{Prefer:"return=minimal"}});
      }else await db("club_stamp_progress?on_conflict=club_id,player_id,stamp_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({club_id:clubId,player_id:playerId,stamp_id:stampId,source:"manual",completed_by:user.id})});
      const adventureId=Number(body.adventure_id),finalized=Number.isSafeInteger(adventureId)&&adventureId>0?await finalizeRun(clubId,adventureId):null;
      return reply({ok:true,finalized});
    }
    return reply({ok:false,error:"unknown_action"},400);
  }catch(e){
    const message=String((e as Error&{dbMessage?:string})?.dbMessage||(e as Error)?.message||e);
    const status:Record<string,number>={not_a_club_member:403,club_not_found:404,bad_adventure:400,one_to_three_stamps_required:400,invalid_stamp_references:400,participant_required:400,completed_adventure_immutable:409,active_adventure_snapshot_locked:409,game_mode_not_available:409,adventure_locked:409,solo_requires_one_player:409,babygirl_needs_two:409,group_needs_two:409,board_not_found:409,beneficiary_not_found:409};
    if(Object.hasOwn(status,message))return reply({ok:false,error:message},status[message]);
    console.error("club_api_error");return reply({ok:false,error:"server_error"},500);
  }
});