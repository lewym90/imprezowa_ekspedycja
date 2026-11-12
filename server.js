// Imprezowa Ekspedycja — serwer: pliki statyczne + pokoje WebSocket (bez zależności).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptUpgrade} from './server/ws.js';
import {createRooms} from './server/rooms.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const HOST=process.env.HOST||'127.0.0.1', PORT=Number(process.env.PORT)||4173;
const DATA_DIR=process.env.DATA_DIR||path.join(ROOT,'.data');
const EXTRA_ORIGINS=(process.env.ALLOW_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const PUBLIC=['index.html','app.js','sw.js','manifest.webmanifest','css','js','src','assets','data'];
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.mp4':'video/mp4','.ico':'image/x-icon'};

const readJson=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const content={cards:readJson('data/01_Biblioteka_Kart/karty_250.json'),events:readJson('data/03_Wydarzenia_i_Karty_Specjalne/wydarzenia_60.json'),missions:readJson('data/04_Misje_i_Nagrody/misje_tajne_25.json')};
const rooms=createRooms({content});
const SAVE=path.join(DATA_DIR,'rooms.json');
try{fs.mkdirSync(DATA_DIR,{recursive:true});if(fs.existsSync(SAVE)){const n=rooms.load(JSON.parse(fs.readFileSync(SAVE,'utf8')));console.log(`Wczytano pokoje: ${n}`)}}catch(e){console.error('Nie wczytano zapisu pokoi:',e.message)}
function persist(){
  let dirty=false;for(const r of rooms.rooms.values())if(r.dirty){dirty=true;r.dirty=false}
  if(!dirty)return;
  try{const tmp=SAVE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rooms.dump()),{mode:0o600});fs.renameSync(tmp,SAVE)}catch(e){console.error('Zapis pokoi nieudany:',e.message)}
}

const SECURITY={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const server=http.createServer((req,res)=>{
  let p;try{p=decodeURIComponent(new URL(req.url,'http://x').pathname)}catch{res.writeHead(400);return res.end()}
  if(p==='/healthz'){res.writeHead(200,{'Content-Type':'application/json',...SECURITY});return res.end(JSON.stringify({ok:true,...rooms.stats()}))}
  if(p==='/')p='/index.html';
  const rel=p.replace(/^\/+/,'');
  if(rel.includes('\0')||!PUBLIC.includes(rel.split('/')[0])){res.writeHead(404,SECURITY);return res.end('Not found')}
  const file=path.resolve(ROOT,rel);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403,SECURITY);return res.end('Forbidden')}
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404,SECURITY);return res.end('Not found')}
    const ext=path.extname(file);const immutable=/\.(webp|png|jpg|woff2|mp3|ogg|mp4)$/.test(ext);
    res.writeHead(200,{'Content-Type':TYPES[ext]||'application/octet-stream','Content-Length':st.size,'Cache-Control':immutable?'public, max-age=86400':'no-cache',...SECURITY});
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

const perIp=new Map();
const ipOf=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
const sockets=new Set();
server.on('upgrade',(req,socket)=>{
  if(new URL(req.url,'http://x').pathname!=='/ws'){socket.end('HTTP/1.1 404 Not Found\r\n\r\n');return}
  const ip=ipOf(req);if((perIp.get(ip)||0)>=40){socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');return}
  const host=req.headers.host;
  const allowOrigin=o=>{try{const u=new URL(o);return u.host===host||u.hostname==='localhost'||u.hostname==='127.0.0.1'||EXTRA_ORIGINS.includes(o)}catch{return false}};
  let bucket=40,last=Date.now();
  const conn=acceptUpgrade(req,socket,{
    allowOrigin,
    onMessage:(c,raw)=>{
      const t=Date.now();bucket=Math.min(40,bucket+(t-last)/1000*20);last=t;
      if(bucket<1)return c.send({t:'error',message:'Za dużo komunikatów — zwolnij'});bucket--;
      let msg;try{msg=JSON.parse(raw)}catch{return c.send({t:'error',message:'Zły format'})}
      if(!msg||typeof msg!=='object')return;
      rooms.handle(c,msg);
    },
    onClose:c=>{perIp.set(ip,Math.max(0,(perIp.get(ip)||1)-1));sockets.delete(c);rooms.onClose(c)}
  });
  if(conn){perIp.set(ip,(perIp.get(ip)||0)+1);sockets.add(conn)}
});

const hb=setInterval(()=>{for(const c of sockets){if(!c.alive){c.close(1001);continue}c.alive=false;c.ping()}},25000);
const saver=setInterval(()=>{rooms.sweep();persist()},5000);
function bye(){clearInterval(hb);clearInterval(saver);persist();for(const c of sockets)c.close(1001);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref()}
process.on('SIGTERM',bye);process.on('SIGINT',bye);
server.listen(PORT,HOST,()=>console.log(`Imprezowa Ekspedycja: http://${HOST}:${PORT}`));
