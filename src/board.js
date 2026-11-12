/** Plansze świata: graf skierowany z 24 polami głównej trasy, trzema checkpointami i trzema odnogami. */
const REGIONS={
 W01:['Plaża','Dżungla','Wodospad','Wulkan','Latarnia'],W02:['Dziedziniec','Biblioteka','Lochy','Wieża','Sala Tronowa'],W03:['Rynek','Ulica','Ratusz','Podziemia','Plac Finałowy'],W04:['Baza','Orbita','Laboratorium','Stacja','Rdzeń'],W05:['Miasteczko','Kopalnia','Kanion','Ranczo','Pojedynek'],W06:['Recepcja','Hala','Pracownia','Sektor X','Komora'],W07:['Lobby','Restauracja','Piętro','Zaplecze','Dach'],W08:['Hol','Galeria','Magazyn','Archiwum','Skarbiec'],W09:['Brama','Scena','Zaplecze','Tłum','Arena'],W10:['Peron','Wagon','Przedział','Lokomotywa','Ostatni Wagon'],W11:['Próg','Sala Odbić','Labirynt','Ogród','Korona'],W12:['Brzeg','Laguna','Wyspa','Mgła','Szczyt']};
const TYPES=['CHALLENGE','DUEL','TEAM','BLUFF','IMPROV','REFLEX','EVENT','TREASURE','RISK','REST','SECRET'];
const VARIANTS={W01:[14,21],W02:[14,22],W03:[14,23],W04:[14,24],W05:[15,21],W06:[15,22],W07:[15,23],W08:[15,24],W09:[16,21],W10:[16,22],W11:[16,23],W12:[16,24]};
export function buildBoard(worldId,worldName=''){
 const regions=REGIONS[worldId];if(!regions)throw new Error(`Nieznany świat: ${worldId}`);
 const nodes=[{id:`${worldId}-S`,type:'START',region:regions[0],label:'Obóz Ekspedycji',x:5,y:50,edges:[`${worldId}-01`]}];
 for(let i=1;i<=24;i++){
  const ri=Math.min(4,Math.floor((i-1)/5));let type=TYPES[(i*7+Number(worldId.slice(1)))%TYPES.length];
  if([6,12,18].includes(i))type='CHECKPOINT';if(i===24)type='FINAL';
  const row=Math.floor((i-1)/6),col=(i-1)%6;
  nodes.push({id:`${worldId}-${String(i).padStart(2,'0')}`,type,region:regions[ri],label:`${regions[ri]} — ${type.toLowerCase()}`,x:12+col*15,y:15+row*23,edges:[]});
 }
 nodes.push({id:`${worldId}-F`,type:'FINISH',region:regions[4],label:'Meta',x:94,y:50,edges:[]});
 for(let i=1;i<24;i++)nodes[i].edges.push(`${worldId}-${String(i+1).padStart(2,'0')}`);nodes[24].edges.push(`${worldId}-F`);
 const targets=VARIANTS[worldId];
 const branches=[{at:5,alt:'ALT-A',merge:6,type:'TREASURE',region:regions[1],x:27,y:8},{at:13,alt:'ALT-B',merge:targets[0],type:'RISK',region:regions[3],x:72,y:87},{at:20,alt:'ALT-C',merge:targets[1],type:'EVENT',region:regions[4],x:84,y:12}];
 for(const b of branches){const id=`${worldId}-${b.alt}`;nodes[b.at].edges.push(id);nodes.push({id,type:b.type,region:b.region,label:`Odnoga — ${b.region}`,x:b.x,y:b.y,edges:[`${worldId}-${String(b.merge).padStart(2,'0')}`]});}
 const ids=new Set(nodes.map(n=>n.id));for(const n of nodes)for(const e of n.edges)if(!ids.has(e))throw new Error(`Krawędź do nieistniejącego pola: ${e}`);
 const checkpoints=[6,12,18].map(i=>`${worldId}-${String(i).padStart(2,'0')}`);
 return {id:worldId,name:worldName,version:2,topologyVariant:targets.join('-'),startNode:`${worldId}-S`,finishNode:`${worldId}-F`,nodes,edges:nodes.flatMap(n=>n.edges.map(to=>({from:n.id,to}))),checkpoints,branches:branches.map(b=>({at:`${worldId}-${String(b.at).padStart(2,'0')}`,choices:[`${worldId}-${String(b.at+1).padStart(2,'0')}`,`${worldId}-${b.alt}`]}))};
}
export function validateBoard(board){const ids=new Set(board.nodes.map(n=>n.id)),errors=[];if(ids.size!==board.nodes.length)errors.push('Powtórzone identyfikatory pól');if(!ids.has(board.startNode)||!ids.has(board.finishNode))errors.push('Brak startu lub mety');for(const n of board.nodes){if(!n.edges.length&&n.id!==board.finishNode)errors.push(`Ślepy zaułek: ${n.id}`);for(const e of n.edges)if(!ids.has(e))errors.push(`Nieznany cel krawędzi: ${e}`);}const reachable=new Set([board.startNode]),q=[board.startNode];while(q.length){const id=q.shift();for(const n of board.nodes.find(x=>x.id===id).edges)if(!reachable.has(n)){reachable.add(n);q.push(n);}}if(!reachable.has(board.finishNode))errors.push('Meta nieosiągalna');for(const cp of board.checkpoints)if(!reachable.has(cp))errors.push(`Checkpoint nieosiągalny: ${cp}`);if(board.checkpoints.length!==3)errors.push('Każda plansza musi mieć dokładnie trzy checkpointy');if(board.branches.length!==3)errors.push('Każda plansza musi mieć dokładnie trzy rozwidlenia');return{valid:errors.length===0,errors,nodeCount:board.nodes.length,edgeCount:board.edges.length,reachableCount:reachable.size};}
export const WORLD_REGIONS=REGIONS;
