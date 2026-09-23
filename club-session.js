(function(){
  'use strict';
  const url='https://tzxlrglgwzinefutledx.supabase.co';
  const key='sb_publishable_s54v4rmFk_BjHoweE7mliA_w64vK6WR';
  const apiUrl=url+'/functions/v1/club-api';
  const sessionKey='bbb-auth-session-v1';
  let session=null;
  function read(){try{return JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{return null}}
  function save(value){session=value;if(value)localStorage.setItem(sessionKey,JSON.stringify(value));else localStorage.removeItem(sessionKey)}
  function callbackSession(){
    const raw=location.hash.startsWith('#')?location.hash.slice(1):'';if(!raw)return null;
    const p=new URLSearchParams(raw),access_token=p.get('access_token'),refresh_token=p.get('refresh_token');
    if(!access_token||!refresh_token)return null;
    history.replaceState(null,'',location.pathname+location.search);
    return {access_token,refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(p.get('expires_in')||3600),token_type:'bearer'};
  }
  async function refresh(){
    if(!session?.refresh_token)return null;
    const r=await fetch(url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
    if(!r.ok){save(null);return null}
    const d=await r.json();save({...d,expires_at:Math.floor(Date.now()/1000)+Number(d.expires_in||3600)});return session;
  }
  async function ready(){
    const callback=callbackSession();if(callback)save(callback);else session=read();
    if(session&&Number(session.expires_at||0)<Math.floor(Date.now()/1000)+60)await refresh();
    if(session){
      const r=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+session.access_token}});
      if(r.ok)session.user=await r.json();else if(!await refresh())save(null);
    }
    window.dispatchEvent(new CustomEvent('passport-auth-ready',{detail:session}));return session;
  }
  async function magicLink(email,redirect){
    const target=redirect||location.origin+location.pathname;
    const r=await fetch(url+'/auth/v1/otp?redirect_to='+encodeURIComponent(target),{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:String(email||'').trim(),create_user:true})});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||d.message||d.error_description||'Could not send sign-in link');return d;
  }
  async function completeMagicLink(raw){
    let link;try{link=new URL(String(raw||'').trim())}catch{throw new Error('invalid_email_link')}
    if(link.origin!==url||link.pathname!=='/auth/v1/verify')throw new Error('invalid_email_link');
    const tokenHash=link.searchParams.get('token')||link.searchParams.get('token_hash')||'',type=link.searchParams.get('type')||'magiclink';
    if(!tokenHash||!['magiclink','signup','email'].includes(type))throw new Error('invalid_email_link');
    const r=await fetch(url+'/auth/v1/verify',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({token_hash:tokenHash,type})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token||!d.refresh_token)throw new Error(d.error_description||d.msg||d.message||'email_link_expired');
    save({...d,expires_at:Math.floor(Date.now()/1000)+Number(d.expires_in||3600)});return session;
  }
  async function call(action,payload={}){
    if(!session?.access_token)throw new Error('sign_in_required');
    if(Number(session.expires_at||0)<Math.floor(Date.now()/1000)+60&&!await refresh())throw new Error('sign_in_required');
    const r=await fetch(apiUrl,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({ok:false,error:'bad_response'}));if(!r.ok||!d.ok){const e=new Error(d.error||('HTTP '+r.status));e.data=d;throw e}return d;
  }
  function signOut(){save(null);localStorage.removeItem('bbb-active-club');location.reload()}
  function activeClub(){return localStorage.getItem('bbb-active-club')||''}
  function setActiveClub(id){if(id)localStorage.setItem('bbb-active-club',id);else localStorage.removeItem('bbb-active-club')}
  window.PassportCloud={url,key,ready,magicLink,completeMagicLink,call,signOut,session:()=>session,activeClub,setActiveClub};
  ready().catch(()=>window.dispatchEvent(new CustomEvent('passport-auth-ready',{detail:null})));
})();
