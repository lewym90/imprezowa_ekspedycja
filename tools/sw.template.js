/* Service worker — GENEROWANY przez tools/build-sw.mjs. Nie edytuj sw.js ręcznie (edytuj tools/sw.template.js). */
const VERSION='__VERSION__';
const CACHE='imprezowa-ekspedycja-'+VERSION;
const CORE=__CORE__;
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('imprezowa-ekspedycja-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
// strategia: sieć najpierw dla dokumentów, skryptów i danych (zawsze świeża wersja), pamięć podręczna dla grafik i czcionek; offline = z pamięci
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  const heavy=/\.(webp|png|jpg|jpeg|woff2|mp3|ogg|mp4)$/i.test(url.pathname);
  if(heavy){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(ch=>ch.put(req,c))}return res})));
  }else{
    e.respondWith(fetch(req).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(ch=>ch.put(req,c))}return res}).catch(()=>caches.match(req).then(hit=>hit||(req.mode==='navigate'?caches.match('./index.html'):Response.error()))));
  }
});
