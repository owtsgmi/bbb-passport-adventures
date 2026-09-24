(function(){
  'use strict';
  const url='https://tzxlrglgwzinefutledx.supabase.co';
  const key='sb_publishable_s54v4rmFk_BjHoweE7mliA_w64vK6WR';
  const apiUrl=url+'/functions/v1/club-api';
  const authUrl=url+'/functions/v1/passport-auth';
  const sessionKey='bbb-passport-session-v2';
  let session=null,readyPromise=null;
  function read(){try{return JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{return null}}
  function save(value){session=value;if(value)localStorage.setItem(sessionKey,JSON.stringify(value));else localStorage.removeItem(sessionKey)}
  async function auth(action,payload={},token=''){
    const r=await fetch(authUrl,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({ok:false,error:'bad_response'}));if(!r.ok||!d.ok){const e=new Error(d.error||('HTTP '+r.status));e.data=d;throw e}return d;
  }
  async function ready(){
    if(readyPromise)return readyPromise;
    readyPromise=(async()=>{
      session=read();
      if(session?.token){
        try{const d=await auth('session',{},session.token);session={...session,user:d.user,expires_at:d.expires_at};save(session)}catch{save(null)}
      }else save(null);
      window.dispatchEvent(new CustomEvent('passport-auth-ready',{detail:session}));
      return session;
    })();
    return readyPromise;
  }
  async function signIn(slUsername,password){const d=await auth('login',{sl_username:slUsername,password});save({token:d.token,user:d.user,expires_at:d.expires_at});return session}
  async function register(slUsername,password,displayName){const d=await auth('register',{sl_username:slUsername,password,display_name:displayName||slUsername});save({token:d.token,user:d.user,expires_at:d.expires_at});return session}
  async function call(action,payload={}){
    if(!session?.token)throw new Error('sign_in_required');
    const r=await fetch(apiUrl,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({ok:false,error:'bad_response'}));if(!r.ok||!d.ok){if(r.status===401)save(null);const e=new Error(d.error||('HTTP '+r.status));e.data=d;throw e}return d;
  }
  async function signOut(){const token=session?.token;save(null);localStorage.removeItem('bbb-active-club');if(token)try{await auth('logout',{},token)}catch{}location.reload()}
  function activeClub(){return localStorage.getItem('bbb-active-club')||''}
  function setActiveClub(id){if(id)localStorage.setItem('bbb-active-club',id);else localStorage.removeItem('bbb-active-club')}
  window.PassportCloud={url,key,ready,signIn,register,call,signOut,session:()=>session,activeClub,setActiveClub};
  ready().catch(()=>window.dispatchEvent(new CustomEvent('passport-auth-ready',{detail:null})));
})();
