/* Układ pól na planszy 1920×1080. Każdy świat ma własny kształt trasy
   (liczba i amplituda zakrętów), ale zawsze biegnie od lewego dołu do prawego góry,
   tak jak „spokojny pas terenu” w tłach planszy. */
export const WORLD_W=1920,WORLD_H=1080;
const WAVES={W01:3,W02:2,W03:3,W04:4,W05:2,W06:4,W07:3,W08:2,W09:4,W10:3,W11:3,W12:2};
const AMP={W01:210,W02:250,W03:190,W04:170,W05:260,W06:160,W07:220,W08:270,W09:150,W10:200,W11:210,W12:250};
const X0=190,Y0=870,X1=1730,Y1=250;               // start i meta
const MIN_X=110,MAX_X=1810,MIN_Y=200,MAX_Y=900;   // bezpieczny obszar (góra i dół zostają dla paneli)

/* Trasy dopasowane do namalowanej drogi na grafice planszy (współrzędne w pikselach grafiki 1672×941). */
const ART_W=1672,ART_H=941;
export const ROUTES={
  W08:{pts:[[110,760],[270,690],[450,610],[650,525],[850,450],[1050,385],[1230,305],[1380,225],[1500,160]],weave:{k:3,amp:62}}
};
function routeDense({pts,weave},N){
  const P=pts.map(([x,y])=>[x*WORLD_W/ART_W,y*WORLD_H/ART_H]);
  const g=i=>P[Math.max(0,Math.min(P.length-1,i))],out=[];
  const segs=P.length-1;
  for(let i=0;i<=N;i++){
    const u=i/N*segs,k=Math.min(segs-1,Math.floor(u)),t=u-k;
    const p0=g(k-1),p1=g(k),p2=g(k+1),p3=g(k+2);
    const c=(a,b,c2,d)=>0.5*((2*b)+(-a+c2)*t+(2*a-5*b+4*c2-d)*t*t+(-a+3*b-3*c2+d)*t*t*t);
    out.push([c(p0[0],p1[0],p2[0],p3[0]),c(p0[1],p1[1],p2[1],p3[1])]);
  }
  if(weave){ // łagodne esy-floresy w obrębie szerokiej drogi, żeby trasa była dość długa
    const base=out.map(q=>[...q]);
    for(let i=0;i<=N;i++){
      const a=base[Math.max(0,i-1)],b=base[Math.min(N,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,t=i/N;
      const off=weave.amp*Math.pow(Math.sin(Math.PI*t),0.5)*Math.sin(2*Math.PI*weave.k*t+0.6);
      out[i]=[base[i][0]-dy/l*off,base[i][1]+dx/l*off];
    }
  }
  return out;
}

export function layoutBoard(board){
  const wid=board.id,n=Number(wid.slice(1))||1,k=WAVES[wid]||3,amp=AMP[wid]||200,ph=(n*0.83)%(Math.PI*2);
  const dx=X1-X0,dy=Y1-Y0,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,nx=-uy,ny=ux; // normalna
  const N=600;let dense=[];
  if(ROUTES[wid]){dense=routeDense(ROUTES[wid],N);dense=dense.map(([x,y])=>[Math.min(MAX_X,Math.max(MIN_X,x)),Math.min(MAX_Y,Math.max(MIN_Y,y))])}
  else for(let i=0;i<=N;i++){
    const t=i/N,env=Math.pow(Math.sin(Math.PI*t),0.6);
    const off=amp*env*Math.sin(2*Math.PI*k*t+ph);
    let x=X0+dx*t+nx*off,y=Y0+dy*t+ny*off;
    x=Math.min(MAX_X,Math.max(MIN_X,x));y=Math.min(MAX_Y,Math.max(MIN_Y,y));
    dense.push([x,y]);
  }
  const cum=[0];for(let i=1;i<dense.length;i++)cum.push(cum[i-1]+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));
  const total=cum[cum.length-1];
  const main=board.nodes.filter(nd=>!nd.id.includes('ALT')).map(nd=>nd.id);        // S, 01..24, F w kolejności
  const pos={};
  main.forEach((id,i)=>{
    const target=total*(i/(main.length-1));let lo=0,hi=cum.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<target)lo=m+1;else hi=m}
    pos[id]={x:Math.round(dense[lo][0]),y:Math.round(dense[lo][1])};
  });
  const branches=[];let side=1;
  for(const nd of board.nodes){
    if(!nd.id.includes('ALT'))continue;
    const from=board.nodes.find(o=>o.edges.includes(nd.id)),to=pos[nd.edges[0]],a=pos[from.id];
    const mx=(a.x+to.x)/2,my=(a.y+to.y)/2;
    const vx=to.x-a.x,vy=to.y-a.y,vl=Math.hypot(vx,vy)||1,px=-vy/vl,py=vx/vl;
    // wybierz stronę i odległość, które dają najwięcej miejsca względem pozostałych pól
    let best=null;
    search:for(const dist of [110,140,170,200]){for(const sd of [side,-side]){
      let x=mx+px*dist*sd,y=my+py*dist*sd;
      x=Math.min(MAX_X-30,Math.max(MIN_X+30,x));y=Math.min(MAX_Y-20,Math.max(MIN_Y+20,y));
      let m=1e9;for(const [k,q] of Object.entries(pos))m=Math.min(m,Math.hypot(q.x-x,q.y-y));
      if(!best||m>best.m+1)best={x,y,m};
      if(m>=95){best={x,y,m};break search}
    }}
    const x=best.x,y=best.y;
    pos[nd.id]={x:Math.round(x),y:Math.round(y)};
    // krzywa kwadratowa przechodząca przez środek w polu odnogi
    const cx=2*x-(a.x+to.x)/2,cy=2*y-(a.y+to.y)/2;
    branches.push({id:nd.id,from:from.id,to:nd.edges[0],d:`M${a.x} ${a.y}Q${Math.round(cx)} ${Math.round(cy)} ${to.x} ${to.y}`});
    side=-side;
  }
  const mainPath='M'+dense.filter((_,i)=>i%3===0||i===dense.length-1).map(p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L');
  return {pos,mainPath,branches,main};
}

/** Najkrótsza ścieżka (lista pól) między dwoma polami wg krawędzi planszy. */
export function pathBetween(board,fromId,toId){
  if(fromId===toId)return [fromId];
  const adj={};for(const nd of board.nodes)adj[nd.id]=nd.edges;
  const q=[[fromId]],seen=new Set([fromId]);
  while(q.length){const p=q.shift(),last=p[p.length-1];
    for(const nx of adj[last]||[]){if(seen.has(nx))continue;const np=[...p,nx];if(nx===toId)return np;seen.add(nx);q.push(np)}}
  return [fromId,toId];
}
