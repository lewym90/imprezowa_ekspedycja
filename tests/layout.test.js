import test from 'node:test';import assert from 'node:assert/strict';
import {buildBoard} from '../src/board.js';
import {layoutBoard,pathBetween} from '../js/layout.js';
const ids=Array.from({length:12},(_,i)=>`W${String(i+1).padStart(2,'0')}`);
test('układ planszy: wszystkie pola każdego świata mieszczą się w obszarze i nie nakładają',()=>{
  for(const id of ids){const b=buildBoard(id,id),{pos}=layoutBoard(b);
    for(const n of b.nodes){const p=pos[n.id];assert.ok(p,`${id}: brak pozycji ${n.id}`);assert.ok(p.x>=80&&p.x<=1840&&p.y>=170&&p.y<=920,`${id} ${n.id} poza obszarem: ${p.x},${p.y}`)}
    const a=b.nodes.map(n=>pos[n.id]);let min=1e9;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)min=Math.min(min,Math.hypot(a[i].x-a[j].x,a[i].y-a[j].y));
    assert.ok(min>=70,`${id}: pola zbyt blisko siebie (${min.toFixed(0)} px)`);}
});
test('układ planszy: każdy świat ma inny kształt trasy',()=>{
  const sig=new Set(ids.map(id=>{const b=buildBoard(id,id),{pos}=layoutBoard(b);return b.nodes.filter(n=>!n.id.includes('ALT')).slice(3,9).map(n=>pos[n.id].y).join(',')}));
  assert.ok(sig.size>=9,`za mało różnych tras: ${sig.size}`);
});
test('ścieżka pionka między polami istnieje dla każdej pary kolejnych pól',()=>{
  const b=buildBoard('W01','x');const main=b.nodes.map(n=>n.id).filter(i=>!i.includes('ALT'));
  for(let i=1;i<main.length;i++)assert.deepEqual(pathBetween(b,main[i-1],main[i]),[main[i-1],main[i]]);
  assert.ok(pathBetween(b,main[0],main.at(-1)).length>=20);
});
