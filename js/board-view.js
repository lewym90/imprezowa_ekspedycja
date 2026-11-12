/* Widok planszy: tło-ilustracja + warstwa SVG (trasa, pola, pionki) + kamera.
   Pola i pionki są grafiką; jeśli w assets/tiles lub assets/pawns pojawią się pliki
   (wygenerowane z promptów), widok użyje ich automatycznie zamiast wektorowych zastępników. */
import {layoutBoard,pathBetween,WORLD_W,WORLD_H} from './layout.js';

const GLYPHS={
  CHALLENGE:'<path d="M13 3 6 14h5l-1 7 8-11h-5z" class="fill"/>',
  DUEL:'<path d="M5 19 19 5M5 5l14 14M4 20l3-1-2-2zM20 20l-3-1 2-2z"/>',
  TEAM:'<circle cx="7.5" cy="9" r="2.6"/><circle cx="16.5" cy="9" r="2.6"/><circle cx="12" cy="14.5" r="2.6"/>',
  BLUFF:'<path d="M4 8c4-3 12-3 16 0v4c0 5-4 8-8 8s-8-3-8-8z"/><path d="M8 11h2M14 11h2M9 16c2 1.5 4 1.5 6 0"/>',
  IMPROV:'<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8"/>',
  REFLEX:'<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M10 3h4M12 3v3"/>',
  EVENT:'<path d="m12 3 9 9-9 9-9-9z"/><path d="M12 8v5M12 16v.5"/>',
  TREASURE:'<path d="M4 11a8 6 0 0 1 16 0v8H4zM4 13h16M12 12v3"/>',
  RISK:'<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" class="fill"/><circle cx="15" cy="9" r="1" class="fill"/><circle cx="12" cy="12" r="1" class="fill"/><circle cx="9" cy="15" r="1" class="fill"/><circle cx="15" cy="15" r="1" class="fill"/>',
  REST:'<path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M9 3c-1 1 1 2 0 3M13 3c-1 1 1 2 0 3"/>',
  SECRET:'<path d="M3 6h18v12H3z"/><path d="m3 7 9 7 9-7"/>',
  CHECKPOINT:'<path d="M7 3v18M7 4h11l-3 4 3 4H7" />',
  START:'<path d="M8 5l11 7-11 7z" class="fill"/>',
  FINAL:'<path d="M3 18 5 7l5 5 2-7 2 7 5-5 2 11z" class="fill"/>',
  FINISH:'<path d="M3 18 5 7l5 5 2-7 2 7 5-5 2 11z" class="fill"/>'
};
const TYPES=['start','meta','checkpoint','fork','challenge','duel','team','bluff','improv','reflex','event','treasure','risk','rest','secret'];
export const art={tiles:new Set(),pawns:new Set()};
export async function probeArt(){
  try{const m=await fetch('assets/art-manifest.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{});
    (m.tiles||[]).forEach(t=>art.tiles.add(t));(m.pawns||[]).forEach(t=>art.pawns.add(t));}catch{}
}
const tileArtKey={START:'start',FINISH:'meta',FINAL:'meta',CHECKPOINT:'checkpoint',CHALLENGE:'challenge',DUEL:'duel',TEAM:'team',BLUFF:'bluff',IMPROV:'improv',REFLEX:'reflex',EVENT:'event',TREASURE:'treasure',RISK:'risk',REST:'rest',SECRET:'secret'};

const NS='http://www.w3.org/2000/svg';
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;

export function createBoardView(host,{onPick}){
  let svg,gPawns,state=null,lay=null,sessionId=null,reduce=false,cur={},shown={},cam={x:0,y:0,w:WORLD_W,h:WORLD_H},camAnim=null,busy=Promise.resolve();
  const avatarFor=i=>art.pawns.has(String(i+1).padStart(2,'0'))?`assets/pawns/pawn-${String(i+1).padStart(2,'0')}.webp`:`assets/avatars/avatar-${String(i+1).padStart(2,'0')}.webp`;

  function build(s){
    state=s;lay=layoutBoard(s.board);sessionId=s.sessionId;shown={};cur={};
    const R=nd=>nd.type==='CHECKPOINT'?44:(nd.type==='FINAL'||nd.type==='FINISH'||nd.type==='START')?50:nd.id.includes('ALT')?33:38;
    const tiles=s.board.nodes.map(nd=>{
      const p=lay.pos[nd.id],r=R(nd),cls=['tile',nd.id.includes('ALT')?'alt':'',nd.type==='CHECKPOINT'?'cp':'',(nd.type==='FINAL'||nd.type==='FINISH')?'fin':''].join(' ');
      const key=tileArtKey[nd.type]||'challenge',g=GLYPHS[nd.type]||GLYPHS.CHALLENGE,sc=r*1.05/12;
      const inner=art.tiles.has(key)?`<image href="assets/tiles/${key}.webp" x="${-r*1.08}" y="${-r*1.08}" width="${r*2.16}" height="${r*2.16}"/>`
        :`<circle class="ring" r="${r}"/><circle class="disc" r="${r*.82}"/><g class="glyph" transform="translate(${-12*sc*.78},${-12*sc*.78}) scale(${sc*.78})">${g}</g>`;
      return `<g class="${cls}" data-node="${nd.id}" transform="translate(${p.x},${p.y})"><circle class="halo" r="${r+8}"/>${inner}<title>${nd.label||nd.type}</title></g>`;
    }).join('');
    const branchPaths=lay.branches.map(b=>`<path d="${b.d}" class="road alt"/>`).join('');
    const defs=`<defs>
      <linearGradient id="gGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e6ae"/><stop offset=".5" stop-color="#d6b36a"/><stop offset="1" stop-color="#8d6a2c"/></linearGradient>
      <linearGradient id="gSilver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3f1ea"/><stop offset=".5" stop-color="#b9b2a2"/><stop offset="1" stop-color="#6c6657"/></linearGradient>
      <radialGradient id="gDisc" cx=".35" cy=".3" r="1"><stop offset="0" stop-color="#3a3326"/><stop offset=".6" stop-color="#15130f"/><stop offset="1" stop-color="#090806"/></radialGradient>
      <radialGradient id="gVig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>
      <filter id="fShadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="fGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
      ${s.players.map((_,i)=>`<clipPath id="cp${i}"><circle r="30"/></clipPath>`).join('')}
    </defs>`;
    svg.innerHTML=`${defs}
      <image class="ext" href="assets/boards/${s.worldId}.webp" x="${-WORLD_W*.6}" y="${-WORLD_H*.6}" width="${WORLD_W*2.2}" height="${WORLD_H*2.2}" preserveAspectRatio="xMidYMid slice"/>
      <image href="assets/boards/${s.worldId}.webp" x="0" y="0" width="${WORLD_W}" height="${WORLD_H}" preserveAspectRatio="xMidYMid slice"/>
      <rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#gVig)"/>
      <g class="route" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="${lay.mainPath}" stroke="#050403" stroke-opacity=".55" stroke-width="92" filter="url(#fShadow)"/>
        <path d="${lay.mainPath}" stroke="#d6b36a" stroke-opacity=".55" stroke-width="84"/>
        <path d="${lay.mainPath}" stroke="#171410" stroke-opacity=".9" stroke-width="78"/>
        <path d="${lay.mainPath}" stroke="#d6b36a" stroke-opacity=".28" stroke-width="3" stroke-dasharray="2 20" transform="translate(0,0)"/>
        <g stroke-width="60">${lay.branches.map(b=>`<path d="${b.d}" stroke="#d6b36a" stroke-opacity=".5" stroke-width="64"/><path d="${b.d}" stroke="#171410" stroke-opacity=".9" stroke-width="58"/>`).join('')}</g>
      </g>
      <g class="tiles">${tiles}</g><g class="pawns"></g>`;
    gPawns=svg.querySelector('.pawns');
    s.players.forEach((p,i)=>{
      const g=document.createElementNS(NS,'g');g.setAttribute('class','pawn');g.dataset.p=p.id;
      g.innerHTML=`<ellipse class="sh" cx="0" cy="30" rx="26" ry="8" fill="#000" opacity=".55" filter="url(#fShadow)"/><circle class="glow" r="46" filter="url(#fGlow)"/><circle class="pring" r="34"/><g clip-path="url(#cp${i})"><image href="${avatarFor(i)}" x="-30" y="-30" width="60" height="60"/></g>`;
      gPawns.appendChild(g);
    });
    svg.querySelectorAll('.tile').forEach(t=>t.addEventListener('click',()=>{if(t.classList.contains('choice'))onPick?.(t.dataset.node)}));
    s.players.forEach(p=>{cur[p.id]=s.positionByPlayer[p.id];shown[p.id]=lay.pos[cur[p.id]]});
    place();focusCamera(s,true);
  }
  function offsets(){ // rozsunięcie pionków stojących na jednym polu
    const by={};Object.entries(cur).forEach(([pid,n])=>(by[n]=by[n]||[]).push(pid));const o={};
    for(const [n,ids] of Object.entries(by)){ids.forEach((pid,i)=>{const k=ids.length;o[pid]=k===1?[0,-28]:[(i-(k-1)/2)*30,-30+(i%2)*10]})}
    return o;
  }
  function place(overridePos){
    const off=offsets();
    state.players.forEach(p=>{
      const g=gPawns.querySelector(`[data-p="${p.id}"]`);const base=overridePos?.[p.id]||lay.pos[cur[p.id]];const o=overridePos?.[p.id]?[0,-28]:(off[p.id]||[0,-28]);
      shown[p.id]=base;g.setAttribute('transform',`translate(${base.x+o[0]},${base.y+o[1]})`);
      g.classList.toggle('act',p.id===state.players[state.activeIndex]?.id);
    });
  }
  async function hop(pid,from,to,dur){
    const t0=performance.now();
    await new Promise(res=>{const step=now=>{const t=Math.min(1,(now-t0)/dur),e=ease(t);
      const x=from.x+(to.x-from.x)*e,y=from.y+(to.y-from.y)*e-Math.sin(Math.PI*t)*36;
      const g=gPawns.querySelector(`[data-p="${pid}"]`);g.setAttribute('transform',`translate(${x},${y-28})`);
      g.querySelector('.sh').setAttribute('cy',30+Math.sin(Math.PI*t)*30);
      t<1?requestAnimationFrame(step):res()};requestAnimationFrame(step)});
  }
  async function movePawn(pid,toNode){
    const from=cur[pid];if(from===toNode)return;
    const path=pathBetween(state.board,from,toNode);
    if(reduce){cur[pid]=toNode;place();return}
    for(let i=1;i<path.length;i++){
      const a=lay.pos[path[i-1]],b=lay.pos[path[i]];
      await hop(pid,a,b,260);cur[pid]=path[i];
      const act=state.players.find(p=>p.id===pid);
      moveCameraTo(b,false);
    }
    place();
  }
  /* ---- kamera ---- */
  function viewFor(center){
    const r=svg.getBoundingClientRect(),asp=(r.width||1)/(r.height||1);
    if(asp>=1.15){ // cała trasa w kadrze
      const ps=Object.values(lay.pos),pad=95;
      const minx=Math.min(...ps.map(p=>p.x))-pad,maxx=Math.max(...ps.map(p=>p.x))+pad,miny=Math.min(...ps.map(p=>p.y))-pad-40,maxy=Math.max(...ps.map(p=>p.y))+pad+40;
      let w=maxx-minx,h=maxy-miny;if(w/h<asp)w=h*asp;else h=w/asp;
      return {x:(minx+maxx)/2-w/2,y:(miny+maxy)/2-h/2,w,h};
    }
    const h=560,w=h*asp; // widok pionowy: kamera podąża za pionkiem
    return {x:center.x-w/2,y:center.y-h/2,w,h};
  }
  function applyCam(c){cam=c;svg.setAttribute('viewBox',`${c.x.toFixed(1)} ${c.y.toFixed(1)} ${c.w.toFixed(1)} ${c.h.toFixed(1)}`)}
  function moveCameraTo(center,instant){
    const target=viewFor(center);if(instant||reduce){applyCam(target);return}
    const from={...cam},t0=performance.now(),dur=520;camAnim&&cancelAnimationFrame(camAnim);
    const step=now=>{const t=Math.min(1,(now-t0)/dur),e=ease(t);applyCam({x:from.x+(target.x-from.x)*e,y:from.y+(target.y-from.y)*e,w:from.w+(target.w-from.w)*e,h:from.h+(target.h-from.h)*e});if(t<1)camAnim=requestAnimationFrame(step)};
    camAnim=requestAnimationFrame(step);
  }
  function focusCamera(s,instant){
    const a=s.players[s.activeIndex];const p=lay.pos[cur[a.id]]||lay.pos[s.board.startNode];moveCameraTo(p,instant);
  }
  function markChoices(s){
    svg.querySelectorAll('.tile.choice').forEach(t=>t.classList.remove('choice'));
    if(s.phase==='PATH_CHOICE')(s.pendingChoices||[]).forEach(id=>svg.querySelector(`[data-node="${id}"]`)?.classList.add('choice'));
  }
  function mount(){
    svg=document.createElementNS(NS,'svg');svg.setAttribute('class','board-svg');svg.setAttribute('viewBox',`0 0 ${WORLD_W} ${WORLD_H}`);svg.setAttribute('preserveAspectRatio','xMidYMid slice');svg.setAttribute('role','img');svg.setAttribute('aria-label','Plansza ekspedycji');
    host.appendChild(svg);
    new ResizeObserver(()=>{if(state)focusCamera(state,true)}).observe(host);
  }
  mount();
  return {
    el:svg,
    setReduceMotion(v){reduce=!!v},
    update(s){
      if(!state||sessionId!==s.sessionId||state.worldId!==s.worldId)build(s);
      state=s;markChoices(s);
      busy=busy.then(async()=>{
        for(const p of s.players){await movePawn(p.id,s.positionByPlayer[p.id])}
        place();focusCamera(s,false);
      });
      place();
    },
    reset(){state=null;sessionId=null}
  };
}
