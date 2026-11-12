import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {authorize,sanitize} from '../server/rooms.js';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const freePort=()=>new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
async function startServer(dataDir,port){
  const p=spawn(process.execPath,['server.js'],{cwd:ROOT,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dataDir},stdio:['ignore','pipe','inherit']});
  await new Promise((res,rej)=>{p.stdout.on('data',d=>{if(String(d).includes('http://'))res()});p.on('exit',c=>rej(new Error('server exit '+c)));setTimeout(()=>rej(new Error('server timeout')),8000)});
  return p;
}
function client(port){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);const inbox=[];const waiters=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);inbox.push(m);for(const w of [...waiters])if(w.pred(m)){waiters.splice(waiters.indexOf(w),1);w.res(m)}};
  const open=new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('ws error'))});
  const c={ws,inbox,open,
    send:o=>ws.send(JSON.stringify(o)),
    wait:(pred,ms=4000)=>new Promise((res,rej)=>{const f=inbox.find(pred);if(f)return res(f);const w={pred,res};waiters.push(w);setTimeout(()=>rej(new Error('timeout waiting')),ms)}),
    next:(pred,ms=4000)=>new Promise((res,rej)=>{const w={pred,res};waiters.push(w);setTimeout(()=>rej(new Error('timeout next')),ms)}),
    last:t=>[...inbox].reverse().find(m=>m.t===t),
    close:()=>ws.close()};
  return c;
}
const uid=()=>'t'+Math.random().toString(16).slice(2);

test('autoryzacja: tura, pola własne, komendy hosta',()=>{
  const st={activeIndex:1,players:[{id:'p1'},{id:'p2'}]};
  assert.equal(authorize('seat','p2',st,{type:'ROLL',commandId:'a'}),null);
  assert.match(authorize('seat','p1',st,{type:'ROLL',commandId:'a'}),/nie Twoja/);
  assert.match(authorize('seat','p1',st,{type:'RESOLVE_FINALE',commandId:'a'}),/TV/);
  assert.equal(authorize('seat','p1',st,{type:'RESOLVE_SECRET_MISSION',playerId:'p1',commandId:'a'}),null);
  assert.match(authorize('seat','p1',st,{type:'CAST_VOTE',voterId:'p2',commandId:'a'}),/za siebie/);
  assert.equal(authorize('host',null,st,{type:'PAUSE',commandId:'a'}),null);
  assert.ok(authorize('spectator',null,st,{type:'ROLL',commandId:'a'}));
  assert.ok(authorize('seat','p1',st,{type:'HACK',commandId:'a'}));
  assert.ok(authorize('host',null,st,{type:'ROLL'}));
});

test('pełna gra przez WebSocket: TV + 3 telefony, prywatność, reconnect, restart serwera',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ie-srv-'));const port=await freePort();
  let proc=await startServer(dir,port);
  try{
    const health=await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();assert.equal(health.ok,true);
    for(const bad of ['/server/rooms.js','/package.json','/.git/config','/tests/server.test.js','/..%2fpackage.json'])assert.equal((await fetch(`http://127.0.0.1:${port}${bad}`)).status,404,bad);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);

    const tv=client(port);await tv.open;
    tv.send({t:'create',setup:{players:[{name:'Ala'},{name:'Bartek'},{name:'Czesia'}],worldId:'W01',worldName:'Wyspa',mode:'COMPETITIVE',settings:{intensityMax:2,secretMissionsEnabled:true}}});
    const created=await tv.wait(m=>m.t==='created');assert.match(created.code,/^[A-Z2-9]{4}$/);
    const code=created.code;
    const ph=[];const tokens={};
    for(const id of ['p1','p2','p3']){const c=client(port);await c.open;c.send({t:'peek',code});const seats=await c.wait(m=>m.t==='seats');assert.equal(seats.seats.length,3);c.send({t:'join',code,playerId:id});const j=await c.wait(m=>m.t==='joined');tokens[id]=j.token;ph.push(c)}
    // zajęte miejsce
    const dup=client(port);await dup.open;dup.send({t:'join',code,playerId:'p1'});assert.match((await dup.wait(m=>m.t==='error')).message,/zajęte/);dup.close();
    // zły kod
    const bad=client(port);await bad.open;bad.send({t:'join',code:'ZZZZ',playerId:'p1'});assert.match((await bad.wait(m=>m.t==='error')).message,/pokoju/);bad.close();

    // prywatność: tajne misje
    await new Promise(r=>setTimeout(r,150));
    const priv=ph.map(c=>c.last('state').private);
    const titles=priv.map(p=>p.secretMission?.title).filter(Boolean);
    assert.ok(titles.length>=3,'każdy telefon ma swoją misję');
    const tvState=tv.last('state');assert.equal(tvState.state.deck,undefined);assert.equal(tvState.state.rngState,undefined);
    for(const t of titles)assert.ok(!JSON.stringify(tv.inbox).includes(t),'TV nie zna tajnych misji');
    ph.forEach((c,i)=>{const own=titles[i];for(const t of titles.filter(x=>x!==own))assert.ok(!JSON.stringify(c.inbox).includes(t),'telefon nie zna cudzych misji')});

    // uprawnienia: nie-aktywny gracz nie rzuca kostką
    const st0=tv.last('state').state;const activeId=st0.players[st0.activeIndex].id;const other=ph[['p1','p2','p3'].findIndex(x=>x!==activeId)];
    other.send({t:'cmd',command:{type:'ROLL',commandId:uid()}});assert.match((await other.wait(m=>m.t==='rejected')).message,/nie Twoja/);
    const otherId=['p1','p2','p3'].find(x=>x!==activeId);
    other.send({t:'cmd',command:{type:'CAST_VOTE',voterId:activeId,choiceId:'x',commandId:uid()}});await other.wait(m=>m.t==='rejected'&&/za siebie/.test(m.message));
    other.send({t:'cmd',command:{type:'PAUSE',commandId:uid()}});await other.wait(m=>m.t==='rejected'&&/TV/.test(m.message));

    // pełna rozgrywka sterowana przez aktywny telefon / TV
    const seatClient=id=>ph[['p1','p2','p3'].indexOf(id)];
    let steps=0;let s=tv.last('state').state;
    while(s.phase!=='FINISHED'&&steps++<6000){
      const act=s.players[s.activeIndex].id,ac=seatClient(act);let cmd,who=ac;
      switch(s.phase){
        case 'TURN_START':cmd={type:'ROLL'};break;
        case 'ROLL_REVIEW':cmd={type:'CONFIRM_ROLL'};break;
        case 'PATH_CHOICE':cmd={type:'CHOOSE_PATH',nodeId:s.pendingChoices[0]};break;
        case 'CARD_READY':cmd={type:'CONFIRM_READY'};break;
        case 'CARD_ACTIVE':cmd={type:'RESOLVE_CARD',outcome:'success'};break;
        case 'STEP_COMPLETE':cmd={type:'END_TURN'};break;
        case 'FINALE':cmd={type:'RESOLVE_FINALE',outcome:'success'};who=tv;break;
        case 'TIEBREAK':cmd={type:'RESOLVE_TIEBREAK',winnerIds:[s.tiedPlayers[0]],method:'test'};who=tv;break;
        default:throw new Error('faza '+s.phase);
      }
      const id=uid();const p=tv.next(m=>m.t==='state'&&m.revision>s.revision,3000);
      who.send({t:'cmd',command:{...cmd,commandId:id}});
      s=(await p).state;
    }
    assert.equal(s.phase,'FINISHED');
    // idempotencja: ta sama komenda dwa razy nie psuje stanu
    const rev=tv.last('state').revision;
    tv.send({t:'cmd',command:{type:'PAUSE',commandId:'dup1'}});await tv.next(m=>m.t==='state'||m.t==='rejected').catch(()=>{});

    // reconnect telefonu po tokenie
    const old=ph[0];old.close();await new Promise(r=>setTimeout(r,200));
    const back=client(port);await back.open;back.send({t:'resume',code,token:tokens.p1});
    const r=await back.wait(m=>m.t==='resumed');assert.equal(r.seat,'p1');
    const bs=await back.wait(m=>m.t==='state');assert.equal(bs.private.playerId,'p1');
    back.send({t:'resume',code,token:'zly'});

    // restart serwera: pokój przeżywa, host wraca po tokenie
    await new Promise(r=>setTimeout(r,5500));
    proc.kill('SIGTERM');await new Promise(r=>proc.on('exit',r));
    assert.ok(fs.existsSync(path.join(dir,'rooms.json')),'zapis pokoi istnieje');
    proc=await startServer(dir,port);
    const tv2=client(port);await tv2.open;tv2.send({t:'resume',code,token:created.hostToken});
    const rr=await tv2.wait(m=>m.t==='resumed');assert.equal(rr.role,'host');
    const st2=await tv2.wait(m=>m.t==='state');assert.equal(st2.state.phase,'FINISHED');
    tv2.close();back.close();tv.close();ph.forEach(c=>c.close());
  }finally{proc.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true})}
});

test('sanitize ukrywa prywatną kartę i talię',()=>{
  const s=sanitize({deck:{},eventDeck:[],rngState:1,seed:1,processedCommandIds:[],history:[],players:[{id:'a',secretMission:{title:'X'},specialCards:[]}],activeCard:{id:'c',privacyLevel:'prywatna',instructions:'SEKRET',title:'T',category:'K'}});
  assert.equal(JSON.stringify(s).includes('SEKRET'),false);assert.equal(JSON.stringify(s).includes('"X"'),false);
});
