// Generuje sw.js: pełna lista plików do offline + wersja z hasha zawartości (aktualizacja = nowy cache).
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=new URL('..',import.meta.url).pathname;
const include=['index.html','app.js','manifest.webmanifest','css','js','src','data','assets'];
const skip=/(^|\/)(assets\/sheets|assets\/anim|assets\/audio\/music-[^/]*\.wav)/;
// manifest grafik opcjonalnych (pola i pionki z generatora): interfejs używa ich, jeśli istnieją
const ls=d=>fs.existsSync(path.join(root,d))?fs.readdirSync(path.join(root,d)):[];
fs.writeFileSync(path.join(root,'assets/art-manifest.json'),JSON.stringify({tiles:ls('assets/tiles').filter(f=>f.endsWith('.webp')).map(f=>f.replace('.webp','')),pawns:ls('assets/pawns').filter(f=>/^pawn-\d+\.webp$/.test(f)).map(f=>f.match(/\d+/)[0])}));
const files=[];
const walk=p=>{const full=path.join(root,p);if(!fs.existsSync(full))return;const st=fs.statSync(full);
  if(st.isDirectory()){for(const f of fs.readdirSync(full).sort())walk(path.join(p,f))}
  else if(!skip.test(p)&&!/(demo|validate-content)\.js$/.test(p))files.push(p)};
include.forEach(walk);
const hash=crypto.createHash('sha1');for(const f of files){hash.update(f);hash.update(fs.readFileSync(path.join(root,f)))}
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version+'-'+hash.digest('hex').slice(0,8);
const tpl=fs.readFileSync(path.join(root,'tools/sw.template.js'),'utf8').replace('__VERSION__',version).replace('__CORE__',JSON.stringify(files.map(f=>'./'+f.split(path.sep).join('/')),null,0));
fs.writeFileSync(path.join(root,'sw.js'),tpl);
console.log('sw.js:',version,files.length,'plików');
