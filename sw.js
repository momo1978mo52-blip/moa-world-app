const CACHE='moa-world-v9-20261125-searchfix2';
const ASSETS=['./','./index.html','./styles.css?v=20261125-searchfix2','./app.js?v=20261125-searchfix2',...Array.from({length:9},(_,i)=>'./app.part'+(i+1)+'.txt?v=20261125-searchfix2'),'./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(p=>new Request(p,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('moa-world-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const u=new URL(req.url);if(req.mode==='navigate'){
 e.respondWith(fetch(req,{cache:'no-cache'}).catch(()=>caches.match('./index.html')));return;
 }
 e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(req);if(hit)return hit;const r=await fetch(req);if(r.ok)await c.put(req,r.clone());return r;}));
});
