let clubMode=false,clubData=null,clubPlayers=[],clubProgress=new Map(),clubRuns=[],clubParticipants=[];
function activePlayers(){return clubMode?clubPlayers.filter(function(p){return p.is_active}):[]}
function viewedPlayer(){return clubMode?(clubPlayers.find(function(p){return p.id===currentView})||activePlayers()[0]||null):null}
function viewedDone(){if(!clubMode)return currentView==='partner'?partnerDone:meDone;return clubProgress.get((viewedPlayer()||{}).id)||new Set()}
function participantPlayers(a){
 if(!clubMode)return [];
 const run=clubRuns.find(function(r){return Number(r.adventure_id)===Number(a.id)}),ids=run?clubParticipants.filter(function(x){return x.run_id===run.id}).map(function(x){return x.player_id}):[];
 const pool=ids.length?ids:activePlayers().map(function(p){return p.id});return pool.map(function(id){return clubPlayers.find(function(p){return p.id===id})}).filter(Boolean);
}
setView=function(v){currentView=v;if(clubMode)localStorage.setItem('bbb-club-view-'+clubData.club.id,v);else localStorage.setItem('bbb-view',v);render()};
startedAdventure=function(a){return started.has(a.id)||(clubMode?activePlayers().some(function(p){return a.stamps.some(function(st){return (clubProgress.get(p.id)||new Set()).has(st.id)})}):a.stamps.some(function(st){return meDone.has(st.id)||partnerDone.has(st.id)}))};
togetherComplete=function(a){if(!clubMode)return personComplete(a,meDone)&&personComplete(a,partnerDone);const people=participantPlayers(a);return people.length>0&&people.every(function(p){return personComplete(a,clubProgress.get(p.id)||new Set())})};
sharedNextIndex=function(a){const people=participantPlayers(a);let i=a.stamps.findIndex(function(st){return clubMode?(!people.length||people.some(function(p){return !(clubProgress.get(p.id)||new Set()).has(st.id)})):!(meDone.has(st.id)&&partnerDone.has(st.id))});return i<0?0:i};
const legacyStartAdventure=startAdventure;
startAdventure=function(id){const ok=legacyStartAdventure(id);if(ok&&clubMode)PassportCloud.call('start_adventure',{club_id:clubData.club.id,adventure_id:Number(id),player_ids:activePlayers().map(function(p){return p.id})}).then(function(){return pollClub(true)}).catch(function(){toast('Adventure saved here; club sync will retry.')});return ok};
function canEditViewedPlayer(){const p=viewedPlayer(),session=window.PassportCloud&&PassportCloud.session(),u=session&&session.user&&session.user.id,role=clubData&&clubData.membership&&clubData.membership.role;return !!(clubMode&&p&&(p.user_id===u||role==='owner'||role==='admin'))}
async function toggleClubStamp(advId,stampId){
 const p=viewedPlayer(),set=viewedDone();if(!clubMode||!p)return;
 const completed=!set.has(stampId);if(completed)set.add(stampId);else set.delete(stampId);render();
 try{await PassportCloud.call('set_stamp',{club_id:clubData.club.id,player_id:p.id,stamp_id:stampId,completed:completed});syncCompletedRewardsToPayouts();await writeCloud();await pollClub(true)}catch(e){if(completed)set.delete(stampId);else set.add(stampId);render();toast('Could not update that stamp.')}
}
const legacyMissionRows=missionRows;
missionRows=function(a,mapInteractive){
 if(!clubMode)return legacyMissionRows(a,mapInteractive);
 mapInteractive=!!mapInteractive;const next=sharedNextIndex(a),selected=viewedDone(),people=participantPlayers(a),player=viewedPlayer();
 let h='<table class="mission-table"><thead><tr><th>#</th><th>Passport stop</th><th>'+esc((player&&player.display_name||'Player')+' status')+'</th><th></th></tr></thead><tbody>';
 a.stamps.forEach(function(st,i){
   const personDone=selected.has(st.id),nr=i===next&&!togetherComplete(a),count=people.filter(function(p){return (clubProgress.get(p.id)||new Set()).has(st.id)}).length;
   const cls=(nr?'nextrow ':'')+(mapInteractive?'mapselectable':''),rowClick=mapInteractive?' onclick="selectAdventureStop('+a.id+','+i+')"':'';
   const mapButton=mapInteractive?'<button class="sl mapbtn" title="Reset map and zoom to this stop" onclick="event.stopPropagation();selectAdventureStop('+a.id+','+i+')">🎯 Focus</button>':'';
   const stampButton=canEditViewedPlayer()?'<br><button class="stampbtn" onclick="event.stopPropagation();toggleClubStamp('+a.id+','+st.id+')">'+(personDone?'Undo':'Mark stamp')+'</button>':'';
   h+='<tr class="'+cls+'" data-map-row="'+(mapInteractive?i:'')+'" id="trip-'+a.id+'-stop-'+(i+1)+'"'+rowClick+'><td>'+(i+1)+'</td><td><div class="stopinfo">'+stampThumbHtml(st)+'<div><div class="place">'+esc(st.name)+(nr?'<span class="nexttag">NEXT</span>':'')+'</div><div class="where">'+esc(st.region)+' · '+st.x+', '+st.y+', '+st.z+'</div></div></div></td><td class="who">'+(personDone?'✅ Got it':'○ Needed')+'<span class="small"> · '+count+'/'+people.length+' players</span>'+stampButton+'</td><td class="act"><button class="sl" onclick="event.stopPropagation();copy(fsUrl(adventures.find(function(x){return x.id==='+a.id+'}).stamps['+i+']),&quot;Destination copied for Firestorm&quot;)">🔥 Copy</button>'+mapButton+'</td></tr>';
 });
 return h+'</tbody></table>';
};
const legacyPinnedHtml=pinnedHtml;
pinnedHtml=function(a){
 if(!clubMode)return legacyPinnedHtml(a);
 const selected=viewedDone(),shown=progressFor(a,selected),people=participantPlayers(a),together=a.stamps.filter(function(st){return people.length&&people.every(function(p){return (clubProgress.get(p.id)||new Set()).has(st.id)})}).length;
 const treasureBadge=adventureTreasureEnabled?' <span class="badge mystery">🎁 Mystery L$</span>':'',treasureNote=adventureTreasureEnabled?' · L$ amount reveals only when everyone finishes':'',person=(viewedPlayer()||{}).display_name||'Player';
 return '<div class="pinned" id="pinned-card"><div class="advhead"><div><h3>'+esc(a.title)+treasureBadge+'</h3><div class="meta">'+esc(a.zone)+' · about '+a.minutes+' min · 3 stops · '+people.length+' players</div><div class="progress"><div class="bar" style="width:'+Math.round((shown/a.stamps.length)*100)+'%"></div></div><div class="small">'+esc(person)+' passport: '+shown+'/'+a.stamps.length+' · Group: '+together+'/'+a.stamps.length+treasureNote+'</div></div></div><div style="padding:0 17px 17px">'+missionRows(a,true)+'</div><div class="runmap"><div id="run-map"></div></div></div>';
};
function beneficiaryPlayer(){return clubMode?(activePlayers().find(function(p){return !p.is_payer})||activePlayers()[0]):null}
const legacyPartnerAheadCount=partnerAheadCount;
partnerAheadCount=function(){if(!clubMode)return legacyPartnerAheadCount();const b=beneficiaryPlayer();return b?adventures.filter(function(a){return participantPlayers(a).filter(function(p){return p.id!==b.id}).every(function(p){return personComplete(a,clubProgress.get(p.id)||new Set())})&&!personComplete(a,clubProgress.get(b.id)||new Set())}).length:0};
const legacyRewardHtml=rewardHtml;
rewardHtml=function(){
 if(!clubMode)return legacyRewardHtml();if(!adventureTreasureEnabled)return '';
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
 try{const out=await PassportCloud.call('request_collect',{club_id:clubData.club.id,player_id:beneficiary.id});toast(out.already_requested?'Your 1,000 L$ bonus request is already waiting for the club payer.':'🎉 Nice! Your club payer can now see the 1,000 L$ bonus request in Admin.')}catch(e){toast(e.message==='threshold_not_met'?'Keep adventuring — you need 1,000 L$ to collect.':'Could not send collection request.')}finally{if(btn){btn.disabled=false;btn.textContent=old}}
};
const legacyRender=render;
render=function(){
 legacyRender();const done=viewedDone(),baseline=clubMode&&currentView==='00000000-0000-4000-8000-000000000101'?1:(!clubMode?knownPreCampaignStamps(currentView):0),passportDone=Math.min(TOTAL_PASSPORT_STAMPS,done.size+baseline),toGo=Math.max(0,TOTAL_PASSPORT_STAMPS-passportDone);
 const progressEl=$('#passport-progress'),remainingEl=$('#passport-remaining');if(progressEl)progressEl.textContent=passportDone+' / '+TOTAL_PASSPORT_STAMPS;if(remainingEl)remainingEl.textContent=toGo?toGo+' to go':'Passport complete!';
 const tabs=document.getElementById('player-tabs');if(clubMode&&tabs)tabs.innerHTML=activePlayers().map(function(p,i){return '<button class="viewtab '+(currentView===p.id?'active':'')+'" onclick="setView(&quot;'+p.id+'&quot;)">'+(i===0?'🗡️':i===1?'👽':'🧭')+' '+esc(p.display_name)+'</button>'}).join('');
 const context=document.getElementById('club-context');if(context)context.innerHTML=clubMode?'Playing with <b>'+esc(clubData.club.name)+'</b> · <a href="settings.html">switch or invite players</a>':'';
};
render();
