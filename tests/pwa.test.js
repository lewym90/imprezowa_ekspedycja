import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('manifest: instalowalny, ikony istnieją (any + maskable)',()=>{
  const m=JSON.parse(read('manifest.webmanifest'));assert.equal(m.display,'standalone');
  assert.ok(m.icons.some(i=>i.sizes==='192x192'&&i.purpose==='any'));assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
  for(const i of m.icons)assert.ok(fs.existsSync(path.join(root,i.src)),`brak ${i.src}`);
});
test('service worker: wszystkie pliki z listy offline istnieją, wersja ma hash',()=>{
  const sw=read('sw.js');const core=JSON.parse(sw.match(/const CORE=(\[.*\]);/)[1]);
  assert.ok(core.length>40);for(const f of core)assert.ok(fs.existsSync(path.join(root,f)),`SW: brak pliku ${f}`);
  for(const must of ['./index.html','./app.js','./css/styles.css','./src/engine.js','./js/board-view.js','./js/layout.js','./data/01_Biblioteka_Kart/karty_250.json'])assert.ok(core.includes(must),`SW nie cache'uje ${must}`);
  assert.match(sw,/const VERSION='0\.6\.0-[0-9a-f]{8}'/);
});
test('offline: aplikacja nie ładuje niczego z zewnętrznych adresów',()=>{
  for(const f of ['index.html','css/styles.css','app.js','js/board-view.js','js/layout.js'])assert.doesNotMatch(read(f),/https?:\/\/(?!www\.w3\.org)/,`${f} zawiera zewnętrzny adres`);
});
test('pliki wymagane przez interfejs istnieją (tła, awatary, karty światów)',()=>{
  for(let i=1;i<=12;i++){const w='W'+String(i).padStart(2,'0');for(const f of [`assets/boards/${w}.webp`,`assets/worlds/${w}.webp`])assert.ok(fs.existsSync(path.join(root,f)),`brak ${f}`)}
  for(let i=1;i<=10;i++)assert.ok(fs.existsSync(path.join(root,`assets/avatars/avatar-${String(i).padStart(2,'0')}.webp`)));
  assert.ok(fs.existsSync(path.join(root,'assets/brand/emblem.png')));assert.ok(fs.existsSync(path.join(root,'assets/brand/keyart.webp')));
});
test('silnik w przeglądarce nie importuje modułów node ani JSON z atrybutem',()=>{
  for(const f of ['engine.js','scenario.js','board.js','deck.js','rng.js','rules-data.js']){const s=read('src/'+f);assert.ok(!/from ['"]node:/.test(s),`${f} importuje node:`);assert.ok(!/with\s*\{\s*type:\s*['"]json/.test(s),`${f} importuje JSON z atrybutem`)}
});
test('brak WebSocketu w kliencie dopóki serwer nie istnieje (zgodnie z dokumentacją)',()=>{assert.ok(!read('app.js').includes('WebSocket('))});
