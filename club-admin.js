(function(){
'use strict';
let state=null;
const el=id=>document.getElementById(id);
function remaining(r){return Math.max(0,Number(r&&r.amount||0)-Math.max(0,Number(r&&r.paid_amount||0)))}
async function refresh(){
 await PassportCloud.ready();const clubId=PassportCloud.activeClub(),session=PassportCloud.session();if(!session||!session.user||!clubId)return;
 const d=await PassportCloud.call('load',{club_id:clubId});state=d;
 if(d.membership.role!=='owner'&&d.membership.role!=='admin')return;
 el('club-admin-card').classList.remove('hide');el('club-admin-name').textContent='🎁 '+d.club.name;
 const beneficiary=d.players.find(p=>p.is_active&&p.is_beneficiary)||d.players.find(p=>p.is_active&&!p.is_payer)||d.players.find(p=>p.is_active),balance=(d.rewards||[]).filter(r=>!beneficiary||r.beneficiary_player_id===beneficiary.id).reduce((n,r)=>n+remaining(r),0),pending=(d.collect_requests||[]).find(r=>r.status==='pending');
 el('club-beneficiary').textContent=beneficiary&&beneficiary.display_name||'Not set';el('club-balance').textContent=balance+' L$';el('club-treasure-toggle').textContent='Treasure: '+(d.club.treasure_enabled?'ON':'OFF');
 el('club-request').textContent=pending?'🎉 1,000 L$ bonus requested '+new Date(pending.created_at).toLocaleString():'No bonus request waiting.';
 el('club-mark-paid').disabled=balance<1000;el('club-admin-message').textContent=balance>=1000?'Pay 1,000 L$ manually in Second Life, then record it here.':Math.max(0,1000-balance)+' L$ until the next payment.';
}
el('club-treasure-toggle').onclick=async()=>{try{const enabled=!state.club.treasure_enabled;await PassportCloud.call('update_club',{club_id:state.club.id,treasure_enabled:enabled});await refresh();el('club-admin-message').textContent='Adventure Treasure is '+(enabled?'ON':'OFF')+' for this club.'}catch(e){el('club-admin-message').textContent='Could not update club Treasure.'}};
el('club-mark-paid').onclick=async()=>{if(!state||!confirm('Record ONE 1,000 L$ payment for '+(el('club-beneficiary').textContent||'the beneficiary')+' as paid?\n\nDo this only after you actually send the L$ in Second Life.'))return;try{const out=await PassportCloud.call('mark_paid',{club_id:state.club.id});await refresh();el('club-admin-message').textContent='✓ 1,000 L$ recorded as paid. '+out.remaining_balance+' L$ remains.'}catch(e){el('club-admin-message').textContent=e.message==='threshold_not_met'?'The balance is below 1,000 L$.':'Could not record the club payment.'}};
refresh().catch(()=>{});
})();
