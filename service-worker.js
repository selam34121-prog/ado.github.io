const CACHE='ado-v11';
const ASSETS=['./','index.html','manifest.json','css/main.css','css/components.css','css/animations.css','css/themes.css','css/fixes.css','js/app.js','js/mobile.js','js/update.js','js/storage.js','js/ui.js','js/commands.js','js/expenses.js','js/subscriptions.js','js/notes.js','js/tools.js','js/ai.js','js/settings.js','js/browser.js','js/account.js','js/sync.js','assets/icon.svg'];

self.addEventListener('install',event=>event.waitUntil(
 caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))));
 await self.clients.claim();
 const windows=await self.clients.matchAll({type:'window'});
 await Promise.all(windows.map(client=>client.navigate(client.url)));
})()));

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
  if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
  return response;
 }).catch(()=>caches.match(request).then(cached=>cached||caches.match('./'))));
});

self.addEventListener('message',event=>{if(event.data==='YENILE')self.skipWaiting()});
