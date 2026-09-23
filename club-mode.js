let clubMode=false,clubData=null,clubPlayers=[],clubProgress=new Map(),clubRuns=[],clubParticipants=[],clubParticipantSelection=new Set(),clubStaFiSyncBusy=false,lastClubStaFiSync=0,lastClubActivity=0;
let manualPassportAdjustments={};
try{manualPassportAdjustments=JSON.parse(localStorage.getItem('bbb-manual-passport-adjustments')||'{}')||{}}catch(e){manualPassportAdjustments={}}
function saveManualPassportAdjustments(){try{localStorage.setItem('bbb-manual-passport-adjustments',JSON.stringify(manualPassportAdjustments))}catch(e){}}
function effectivePassportCount(player,done,total){
 const stafiDone=Number(player&&player.stafi_collected_count),hasStaFi=!!(player&&player.stafi_last_success_at&&Number.isFinite(stafiDone)&&stafiDone>=0);
 if(!hasStaFi)return Math.min(total,done.size);
 const key=String(player.id),adj=manualPassportAdjustments[key];
 if(!adj)return Math.min(total,stafiDone);
 const base=Number(adj.base),delta=Math.max(0,Number(adj.delta)||0),caughtUp=Math.max(0,stafiDone-base),remaining=Math.max(0,delta-caughtUp);
 if(remaining!==delta){manualPassportAdjustments[key]={base:stafiDone,delta:remaining};if(!remaining)delete manualPassportAdjustments[key];saveManualPassportAdjustments()}
 return Math.min(total,stafiDone+remaining);
}

function activePlayers(){return clubMode?clubPlayers.filter(function(p){return p.is_active}):[]}
function clubGameMode(){return clubMode&&clubData&&clubData.club?String(clubData.club.game_mode||'group'):'group'}
function adventureRun(a){return clubMode&&a?clubRuns.find(function(r){return Number(r.adventure_id)===Number(a.id)}):null}
function adventureStamps(a){
 if(!a)return [];
 const all=Array.isArray(a.allStamps)?a.allStamps:(Array.isArray(a.stamps)?a.stamps:[]);
 const run=adventureRun(a),ids=run&&Array.isArray(run.stamp_ids)?run.stamp_ids.map(Number).filter(Number.isFinite):[];
 if(ids.length){const wanted=new Set(ids);return all.filter(function(st){return wanted.has(Number(st.id))})}
 return Array.isArray(a.stamps)?a.stamps:[];
}
function retiredCountForAdventure(a){const all=Array.isArray(a&&a.allStamps)?a.allStamps:(a&&a.stamps||[]);return Math.max(0,all.length-adventureStamps(a).length)}
function stopWord(n){return n+' stop'+(n===1?'':'s')}
function copyClubAdventureStop(advId,stampId){
 const a=adventures.find(function(x){return Number(x.id)===Number(advId)}),all=a&&(a.allStamps||a.stamps)||[],st=all.find(function(x){return Number(x.id)===Number(stampId)});
 if(st)copy(fsUrl(st),'SLURL copied — paste into Firestorm chat or location bar');
}
function viewedPlayer(){return clubMode?(clubPlayers.find(function(p){return p.id===currentView})||activePlayers()[0]||null):null}
function viewedDone(){if(!clubMode)return currentView==='partner'?partnerDone:meDone;return clubProgress.get((viewedPlayer()||{}).id)||new Set()}
function participantPlayers(a){
 if(!clubMode)return [];
 const run=clubRuns.find(function(r){return Number(r.adventure_id)===Number(a.id)}),ids=run?clubParticipants.filter(function(x){return x.run_id===run.id}).map(function(x){return x.player_id}):[];
 const pool=ids.length?ids:activePlayers().map(function(p){return p.id});return pool.map(function(id){return clubPlayers.find(function(p){return p.id===id})}).filter(Boolean);
}
const legacyPersonComplete=personComplete,legacyProgressFor=progressFor;
personComplete=function(a,set){if(!clubMode)return legacyPersonComplete(a,set);const stamps=adventureStamps(a);return stamps.length>0&&stamps.every(function(st){return set.has(st.id)})};
progressFor=function(a,set){if(!clubMode)return legacyProgressFor(a,set);return adventureStamps(a).filter(function(st){return set.has(st.id)}).length};
setView=function(v){currentView=v;if(clubMode)localStorage.setItem('bbb-club-view-'+clubData.club.id,v);else localStorage.setItem('bbb-view',v);render()};
startedAdventure=function(a){const stamps=clubMode?adventureStamps(a):a.stamps;return started.has(a.id)||(clubMode?activePlayers().some(function(p){return stamps.some(function(st){return (clubProgress.get(p.id)||new Set()).has(st.id)})}):stamps.some(function(st){return meDone.has(st.id)||partnerDone.has(st.id)}))};
togetherComplete=function(a){
 if(!clubMode)return personComplete(a,meDone)||personComplete(a,partnerDone);
 const people=participantPlayers(a);if(!people.length)return false;
 return clubGameMode()==='babygirl'
   ?people.length===2&&people.every(function(p){return personComplete(a,clubProgress.get(p.id)||new Set())})
   :people.some(function(p){return personComplete(a,clubProgress.get(p.id)||new Set())});
};
sharedNextIndex=function(a){
 const stamps=clubMode?adventureStamps(a):a.stamps;
 if(!clubMode){const set=currentView==='partner'?partnerDone:meDone,i=stamps.findIndex(function(st){return !set.has(st.id)});return i<0?0:i}
 const people=participantPlayers(a);
 if(clubGameMode()==='babygirl'){
   const i=stamps.findIndex(function(st){return !people.length||people.some(function(p){return !(clubProgress.get(p.id)||new Set()).has(st.id)})});
   return i<0?0:i;
 }
 const set=viewedDone(),i=stamps.findIndex(function(st){return !set.has(st.id)});return i<0?0:i;
};
const legacySyncCompletedRewardsToPayouts=syncCompletedRewardsToPayouts;
syncCompletedRewardsToPayouts=function(){return clubMode?false:legacySyncCompletedRewardsToPayouts()};
function selectedParticipantIds(){return activePlayers().map(function(p){return p.id})}
function renderParticipantPicker(){}
const legacyStartAdventure=startAdventure;
startAdventure=function(id){
 const adventure=adventures.find(function(a){return a.id===Number(id)}),players=selectedParticipantIds(),mode=clubGameMode(),stamps=adventureStamps(adventure);
 if(clubMode){
   if(!stamps.length){toast('That adventure has no active passport stops left.');return false}
   if(mode==='solo'&&players.length!==1){toast('Solo mode needs exactly one active player.');return false}
   if(mode==='babygirl'&&players.length!==2){toast('💗 Invite your Babygirl first — this mode needs exactly two players.');return false}
   if(mode==='group'&&players.length<2){toast('👥 Group mode needs at least two players.');return false}
 }
 const ok=legacyStartAdventure(id);
 if(ok&&clubMode&&adventure)PassportCloud.call('start_adventure',{club_id:clubData.club.id,adventure_id:Number(id),stamp_ids:stamps.map(function(st){return st.id}),stamps:stamps.map(function(st){return {id:st.id,name:st.name,region:st.region,x:Number(st.x),y:Number(st.y),z:Number(st.z)}}),player_ids:players}).then(function(){return pollClub(true)}).catch(function(e){
   const msg=e.message==='babygirl_needs_two'?'💗 Babygirl mode needs exactly two players.'
     :e.message==='group_needs_two'?'👥 Group mode needs at least two players.'
     :e.message==='solo_requires_one_player'?'🧭 Solo mode needs exactly one player.'
     :'Could not start that adventure.';
   toast(msg);
 });return ok
};
async function touchClubActivity(force){
 if(!clubMode||document.hidden||(!force&&Date.now()-lastClubActivity<2*60*1000))return false;
 lastClubActivity=Date.now();
 try{await PassportCloud.call('activity',{club_id:clubData.club.id});return true}catch(e){return false}
}
async function maybeAutoStaFiSync(force){
 if(!clubMode||clubStaFiSyncBusy||(!force&&Date.now()-lastClubStaFiSync<60*1000))return false;
 clubStaFiSyncBusy=true;lastClubStaFiSync=Date.now();
 try{const out=await PassportCloud.call('sync_stafi',{club_id:clubData.club.id});if(out.imported>0)toast('✓ StaFi added '+out.imported+' new stamp'+(out.imported===1?'':'s')+'.');return out.verified===true}catch(e){return false}finally{clubStaFiSyncBusy=false}
}
function canEditViewedPlayer(){const p=viewedPlayer(),session=window.PassportCloud&&PassportCloud.session(),u=session&&session.user&&session.user.id,role=clubData&&clubData.membership&&clubData.membership.role;return !!(clubMode&&p&&(p.user_id===u||(!p.user_id&&(role==='owner'||role==='admin'))))}
async function toggleClubStamp(advId,stampId){
 const p=viewedPlayer(),set=viewedDone();if(!clubMode||!p)return;
 const completed=!set.has(stampId),key=String(p.id),stafiDone=Number(p.stafi_collected_count),hasStaFi=!!(p.stafi_last_success_at&&Number.isFinite(stafiDone)&&stafiDone>=0);
 if(completed)set.add(stampId);else set.delete(stampId);
 if(hasStaFi){
   const adj=manualPassportAdjustments[key]||{base:stafiDone,delta:0};
   if(completed)adj.delta=Math.max(0,Number(adj.delta)||0)+1;
   else adj.delta=Math.max(0,(Number(adj.delta)||0)-1);
   if(adj.delta)manualPassportAdjustments[key]=adj;else delete manualPassportAdjustments[key];
   saveManualPassportAdjustments();
 }
 render();
 try{await PassportCloud.call('set_stamp',{club_id:clubData.club.id,player_id:p.id,stamp_id:stampId,adventure_id:Number(advId),completed:completed});await pollClub(true)}catch(e){
   if(completed)set.delete(stampId);else set.add(stampId);
   if(hasStaFi){
     const adj=manualPassportAdjustments[key]||{base:stafiDone,delta:0};
     if(completed)adj.delta=Math.max(0,(Number(adj.delta)||0)-1);
     else adj.delta=Math.max(0,Number(adj.delta)||0)+1;
     if(adj.delta)manualPassportAdjustments[key]=adj;else delete manualPassportAdjustments[key];
     saveManualPassportAdjustments();
   }
   render();toast('Could not update that stamp.');
 }
}
const legacyMissionRows=missionRows;
missionRows=function(a,mapInteractive){
 if(!clubMode)return legacyMissionRows(a,mapInteractive);
 mapInteractive=!!mapInteractive;const stamps=adventureStamps(a),next=sharedNextIndex(a),selected=viewedDone(),people=participantPlayers(a),player=viewedPlayer(),run=adventureRun(a),canMark=run&&run.status==='active'&&canEditViewedPlayer();
 let h='<table class="mission-table"><thead><tr><th>#</th><th>Passport stop</th><th>'+esc((player&&player.display_name||'Player')+' status')+'</th><th></th></tr></thead><tbody>';
 stamps.forEach(function(st,i){
   const personDone=selected.has(st.id),nr=i===next&&!togetherComplete(a),count=people.filter(function(p){return (clubProgress.get(p.id)||new Set()).has(st.id)}).length;
   const cls=(nr?'nextrow ':'')+(mapInteractive?'mapselectable':''),rowClick=mapInteractive?' onclick="selectAdventureStop('+a.id+','+i+')"':'';
   const mapButton='';
   const stampButton=canMark?'<br><button class="stampbtn" onclick="event.stopPropagation();toggleClubStamp('+a.id+','+st.id+')">'+(personDone?'Undo':'Mark stamp')+'</button>':'';
   h+='<tr class="'+cls+'" data-map-row="'+(mapInteractive?i:'')+'" id="trip-'+a.id+'-stop-'+(i+1)+'"'+rowClick+'><td>'+(i+1)+'</td><td><div class="stopinfo">'+stampThumbHtml(st)+'<div><div class="place">'+esc(st.name)+(nr?'<span class="nexttag">NEXT</span>':'')+'</div><div class="where">'+esc(st.region)+' · '+st.x+', '+st.y+', '+st.z+'</div></div></div></td><td class="who">'+(personDone?'✅ Got it':'○ Needed')+'<span class="small"> · '+count+'/'+people.length+' players</span>'+stampButton+'</td><td class="act"><button class="sl" onclick="event.stopPropagation();copyClubAdventureStop('+a.id+','+st.id+')">🔥 Copy SLURL</button>'+mapButton+'</td></tr>';
 });
 return h+'</tbody></table>';
};
const legacyPinnedHtml=pinnedHtml;
pinnedHtml=function(a){
 if(!clubMode)return legacyPinnedHtml(a);
 const stamps=adventureStamps(a),selected=viewedDone(),shown=progressFor(a,selected),people=participantPlayers(a),mode=clubGameMode(),person=(viewedPlayer()||{}).display_name||'Player';
 const best=people.reduce(function(m,p){return Math.max(m,progressFor(a,clubProgress.get(p.id)||new Set()))},0);
 const together=stamps.filter(function(st){return people.length===2&&people.every(function(p){return (clubProgress.get(p.id)||new Set()).has(st.id)})}).length;
 const treasureBadge=mode==='babygirl'?' <span class="badge mystery">💗 Mystery L$</span>':'',retired=retiredCountForAdventure(a);
 const retirementNote=retired?' · '+retired+' retired stop'+(retired===1?'':'s')+' removed':'';
 const modeProgress=mode==='babygirl'?' · Together: '+together+'/'+stamps.length+' · reward after both reach '+stamps.length+'/'+stamps.length
   :mode==='group'?' · Best passport: '+best+'/'+stamps.length
   :'';
 return '<div class="pinned" id="pinned-card"><div class="advhead"><div><h3>'+esc(a.title)+treasureBadge+'</h3><div class="meta">'+esc(a.zone)+' · about '+a.minutes+' min · '+stopWord(stamps.length)+' · '+(mode==='solo'?'🧭 Solo':mode==='babygirl'?'💗 Babygirl':'👥 Group')+retirementNote+'</div><div class="progress"><div class="bar" style="width:'+(stamps.length?Math.round((shown/stamps.length)*100):0)+'%"></div></div><div class="small">'+esc(person)+' passport: '+shown+'/'+stamps.length+modeProgress+'</div></div></div><div style="padding:0 17px 17px">'+missionRows(a,true)+'</div><div class="runmap"><div id="run-map"></div></div></div>';
};
const legacyCollapsedTrip=collapsedTrip;
collapsedTrip=function(a,completed){
 if(!clubMode)return legacyCollapsedTrip(a,completed);
 const stamps=adventureStamps(a),run=adventureRun(a),all=Array.isArray(a.allStamps)?a.allStamps:a.stamps,retired=Math.max(0,all.length-stamps.length),r=completed?rewardFor(a):0;
 const rewardText=adventureTreasureEnabled?(completed&&r?'🎁 '+r+' L$':'🎁 mystery'):'';
 const retiredText=retired&&!run?' · '+retired+' retired':'';
 return '<details class="trip '+(completed?'completed-row':'')+'"><summary><div class="summary-main"><span class="light '+(completed?'red':'green')+'"></span><strong>'+esc(a.title)+'</strong> <span class="small">· '+stopWord(stamps.length)+retiredText+' · ~'+a.minutes+' min</span></div><div class="summary-right">'+rewardText+'</div></summary><div class="tripbody">'+missionRows(a)+'<div class="actions" style="margin-top:10px">'+(completed?'':'<button class="primary" onclick="startAdventure('+a.id+')">Make this our adventure</button>')+'</div></div></details>';
};
const legacyRenderRunMap=renderRunMap,legacySelectAdventureStop=selectAdventureStop;
renderRunMap=async function(a){
 if(!clubMode)return legacyRenderRunMap(a);
 const host=document.getElementById('run-map'),stamps=adventureStamps(a);if(!host||!window.SLGridMap||!stamps.length)return;
 currentAdventureMapId=a.id;selectedAdventureStop=-1;
 currentAdventureMap=new SLGridMap(host,{title:'🗺 Current adventure · '+stopWord(stamps.length)});
 await currentAdventureMap.setLocations(stamps.map(function(st,i){return {name:st.name,region:st.region,x:Number(st.x),y:Number(st.y),z:Number(st.z),label:String(i+1)}}),{fit:true});
};
selectAdventureStop=async function(advId,index){
 if(!clubMode)return legacySelectAdventureStop(advId,index);
 const a=adventures.find(function(x){return x.id===Number(advId)}),stamps=adventureStamps(a);if(!a||!stamps[index])return;
 if(!currentAdventureMap||currentAdventureMapId!==a.id)await renderRunMap(a);
 selectedAdventureStop=index;
 document.querySelectorAll('#pinned-card [data-map-row]').forEach(function(r){
   const selected=Number(r.dataset.mapRow)===index;r.classList.toggle('mapselected',selected);
   const p=r.querySelector('.place');if(p){const old=p.querySelector('.maptag');if(old)old.remove();if(selected)p.insertAdjacentHTML('beforeend','<span class="maptag">FOCUS</span>')}
 });
 const st=stamps[index];await currentAdventureMap.focusLocation({name:st.name,region:st.region,x:Number(st.x),y:Number(st.y),z:Number(st.z),label:String(index+1)},{level:1});
};
function beneficiaryPlayer(){return clubMode?(activePlayers().find(function(p){return p.is_beneficiary})||activePlayers().find(function(p){return !p.is_payer})||activePlayers()[0]):null}
const legacyPartnerAheadCount=partnerAheadCount;
partnerAheadCount=function(){if(!clubMode)return legacyPartnerAheadCount();return 0};
const legacyRewardHtml=rewardHtml;
rewardHtml=function(){
 if(!clubMode)return legacyRewardHtml();if(clubGameMode()!=='babygirl'||!adventureTreasureEnabled)return '';
 syncCompletedRewardsToPayouts();const pending=partnerAheadCount(),due=unpaidLinden(),lifetime=payoutLog.reduce(function(n,r){return n+Math.max(0,Number(r&&r.linden||0))},0),toMilestone=due>=1000?0:1000-due;
 const activeRewards=payoutLog.filter(function(r){return rewardRemaining(r)>0}).slice(0,6),rewardLines=activeRewards.map(function(r){return '<div class="recentline">🎁 '+Number(r.linden||0)+' L$'+(r.title?' · '+esc(r.title):'')+'</div>'}).join('')||'<div class="recentline">No prizes yet.</div>';
 const beneficiary=beneficiaryPlayer(),benefactor=currentView===(beneficiary&&beneficiary.id),beneficiaryName=beneficiary&&beneficiary.display_name||'Player',label=benefactor?'Your Treasure':esc(beneficiaryName)+"'s Treasure",milestone=due>=1000?'🎉 1,000 L$ milestone reached!':toMilestone+' L$ to next 1,000';
 const waiting=pending&&benefactor?'<div class="treasuremeta">✨ '+pending+' adventure'+(pending===1?' is':'s are')+' waiting for you.</div>':'',collect=benefactor&&due>=1000?'<div class="collectrow"><button class="collectbtn" onclick="event.stopPropagation();requestCollectRewards(this)">🎉 Get Your 1,000 L$ Bonus</button><div class="collectnote">Good job — you earned it!</div></div>':'';
 return '<details class="treasuremini"><summary><span>🎁 '+label+'</span><b>'+due+' L$</b></summary><div class="treasurebody"><div class="treasureamount">'+due+' L$</div><div class="treasuremeta">'+milestone+'</div><div class="treasuremeta">Lifetime prizes: <b>'+lifetime+' L$</b></div>'+waiting+collect+'<details class="treasurerecent"><summary>Recent prizes</summary>'+rewardLines+'</details></div></details>';
};
const legacyRequestCollectRewards=requestCollectRewards;
requestCollectRewards=async function(btn){
 if(!clubMode)return legacyRequestCollectRewards(btn);const beneficiary=beneficiaryPlayer();if(currentView!==(beneficiary&&beneficiary.id))return;
 if(unpaidLinden()<1000){toast('Keep adventuring — Collect Rewards unlocks at 1,000 L$.');return}
 const old=btn&&btn.textContent||'Get Your Bonus';if(btn){btn.disabled=true;btn.textContent='Sending…'}
 try{const out=await PassportCloud.call('request_collect',{club_id:clubData.club.id,player_id:beneficiary.id});toast(out.already_requested?'Your 1,000 L$ bonus request is already waiting for the Daddy Warbucks.':'🎉 Nice! Your Daddy Warbucks can see the 1,000 L$ payment in Settings.')}catch(e){toast(e.message==='threshold_not_met'?'Keep adventuring — you need 1,000 L$ to collect.':'Could not send collection request.')}finally{if(btn){btn.disabled=false;btn.textContent=old}}
};
let retiredRunTrimBusy=false;
async function maybeTrimRetiredActiveRun(){
 if(!clubMode||retiredRunTrimBusy)return false;
 const run=clubRuns.find(function(r){return r.status==='active'&&Number(r.adventure_id)===Number(lastAdventure)});
 if(!run)return false;
 const a=adventures.find(function(x){return Number(x.id)===Number(run.adventure_id)});if(!a)return false;
 const current=a.stamps||[],oldIds=(run.stamp_ids||[]).map(Number),currentIds=current.map(function(st){return Number(st.id)});
 if(oldIds.length<=currentIds.length||currentIds.some(function(id){return !oldIds.includes(id)}))return false;
 retiredRunTrimBusy=true;
 try{
   const out=await PassportCloud.call('trim_adventure_stamps',{club_id:clubData.club.id,adventure_id:Number(a.id),stamp_ids:currentIds,stamps:current.map(function(st){return {id:st.id,name:st.name,region:st.region,x:Number(st.x),y:Number(st.y),z:Number(st.z)}})});
   await pollClub(true);toast(out.retired?'All stops retired — that adventure was archived.':'Retired stop removed — this adventure is now '+stopWord(currentIds.length)+'.');return true;
 }catch(e){return false}finally{retiredRunTrimBusy=false}
}

const legacyRender=render;
render=function(){
 legacyRender();const done=viewedDone();
 const player=viewedPlayer(),globalTotal=Number(clubData&&clubData.passport_total||0),shownTotal=globalTotal>0?globalTotal:TOTAL_PASSPORT_STAMPS,shownDone=effectivePassportCount(player,done,shownTotal),toGo=Math.max(0,shownTotal-shownDone);
 const progressEl=$('#passport-progress'),remainingEl=$('#passport-remaining');if(progressEl)progressEl.textContent=shownDone+' / '+shownTotal;if(remainingEl)remainingEl.textContent=toGo?toGo+' to go':'Passport complete!';
 const tabs=document.getElementById('player-tabs');if(clubMode&&tabs)tabs.innerHTML=activePlayers().map(function(p,i){return '<button class="viewtab '+(currentView===p.id?'active':'')+'" onclick="setView(&quot;'+p.id+'&quot;)">'+(i===0?'🗡️':i===1?'👽':'🧭')+' '+esc(p.display_name)+'</button>'}).join('');
 const context=document.getElementById('club-context');if(context){const mode=clubGameMode(),label=mode==='solo'?'🧭 Solo':mode==='babygirl'?'💗 Babygirl':'👥 Group';context.innerHTML=clubMode?'Playing <b>'+label+'</b> with <b>'+esc(clubData.club.name)+'</b> · <a href="settings.html">club settings</a>':'';}
 renderParticipantPicker();
};
render();
