const CACHE='moa-world-v9-20261125-searchfix';
const ASSETS=['./','./index.html','./styles.css?v=20261125-searchfix','./app.js?v=20261125-searchfix','./app.part1.txt','./app.part2.txt','./app.part3.txt','./app.part4.txt','./app.part5.txt','./app.part6.txt','./app.part7.txt','./app.part8.txt','./app.part9.txt','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match('./index.html'))));});

