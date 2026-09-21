self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{}
  const title=data.title||'Passport Adventures';
  const options={
    body:data.body||'You have a Passport Adventures update.',
    tag:data.tag||'bbb-payout',
    renotify:true,
    data:{url:data.url||'https://owtsgmi.github.io/bbb-passport-adventures/'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification?.data?.url||'https://owtsgmi.github.io/bbb-passport-adventures/';
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const w of windows){
      if('focus' in w){await w.focus();if('navigate' in w)await w.navigate(url);return;}
    }
    if(clients.openWindow)await clients.openWindow(url);
  })());
});