// Logika pokojów: autorytatywny stan gry, uprawnienia, widoki publiczne i prywatne.
import crypto from 'node:crypto';
import {createGame,dispatch,getPrivateState,snapshot,restore,ENGINE_VERSION} from '../src/engine.js';

const CODE_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bez 0/O/1/I/L
const HOST_ONLY=new Set(['PAUSE','RESUME','START_VOTE','CLOSE_VOTE','RESOLVE_FINALE','RESOLVE_TIEBREAK','REROLL','ADVANCE_OBJECTIVE']);
const TURN_CMDS=new Set(['ROLL','CONFIRM_ROLL','CHOOSE_PATH','CONFIRM_READY','RESOLVE_CARD','SKIP_CARD','END_TURN','TIMER_START','TIMER_PAUSE','TIMER_RESUME','TIMER_STOP']);
const SELF_FIELD={USE_SPECIAL:'playerId',RESOLVE_SECRET_MISSION:'playerId',CAST_VOTE:'voterId'};
const ROOM_TTL_MS=12*3600e3, MAX_ROOMS=60, MAX_PER_ROOM_CONN=24;

const token=()=>crypto.randomBytes(18).toString('base64url');
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const clean=(s,n)=>String(s??'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,n);

/** Widok bez danych prywatnych: bez tajnych misji, prywatnych kart, talii i RNG. */
export function sanitize(state){
  const s=structuredClone(state);
  delete s.deck;delete s.eventDeck;delete s.rngState;delete s.seed;delete s.processedCommandIds;
  s.history=(s.history||[]).slice(-40).map(h=>({seq:h.seq,type:h.type,atTurn:h.atTurn}));
  s.players=s.players.map(p=>({...p,secretMission:p.secretMission?{hidden:true}:null,specialCards:[...(p.specialCards||[])]}));
  if(s.activeCard?.privacyLevel==='prywatna')s.activeCard={id:s.activeCard.id,title:'Karta prywatna',category:s.activeCard.category,privacyLevel:'prywatna',durationSec:s.activeCard.durationSec,intensity:s.activeCard.intensity,instructions:'Ta karta jest widoczna tylko na telefonie gracza.'};
  return s;
}

export function authorize(role,seatId,state,cmd){
  if(!cmd||typeof cmd.type!=='string'||typeof cmd.commandId!=='string'||cmd.commandId.length>80)return 'Nieprawidłowa komenda';
  if(role==='host')return null;
  if(role!=='seat'||!seatId)return 'Brak uprawnień';
  if(HOST_ONLY.has(cmd.type))return 'Tę akcję wykonuje ekran główny (TV)';
  if(TURN_CMDS.has(cmd.type)){
    const active=state.players[state.activeIndex]?.id;
    return active===seatId?null:'To nie Twoja tura';
  }
  const f=SELF_FIELD[cmd.type];
  if(f)return cmd[f]===seatId?null:'Możesz działać tylko za siebie';
  return 'Nieznana komenda';
}

export function createRooms({content,now=Date.now,random=()=>crypto.randomInt(0,2**31-1)}){
  const rooms=new Map();
  const newCode=()=>{for(let i=0;i<200;i++){let c='';for(let k=0;k<4;k++)c+=CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];if(!rooms.has(c))return c}throw Error('Brak wolnych kodów')};

  function create(setup){
    if(rooms.size>=MAX_ROOMS)throw Error('Serwer ma teraz komplet pokoi — spróbuj za chwilę');
    const names=(setup?.players||[]).map(p=>clean(p?.name,24)).filter(Boolean);
    if(names.length<2||names.length>10)throw Error('Gra wymaga od 2 do 10 graczy');
    const players=names.map((name,i)=>({id:`p${i+1}`,name,avatar:Number.isInteger(setup.players[i]?.avatar)?setup.players[i].avatar%10:i%10}));
    const settings={intensityMax:Math.min(3,Math.max(1,Number(setup.settings?.intensityMax)||2)),secretMissionsEnabled:!!setup.settings?.secretMissionsEnabled,propsAvailable:[]};
    const state=createGame({players:players.map(({id,name})=>({id,name})),worldId:clean(setup.worldId,8)||'W01',worldName:clean(setup.worldName,60),cards:content.cards,events:content.events,missions:content.missions,seed:random(),mode:setup.mode||'COMPETITIVE',settings});
    const room={code:newCode(),hostToken:token(),players,state,seats:Object.fromEntries(players.map(p=>[p.id,{token:null,conn:null}])),host:{conn:null},spectators:new Set(),createdAt:now(),lastActive:now(),dirty:true};
    rooms.set(room.code,room);return room;
  }
  const get=c=>rooms.get(String(c||'').toUpperCase().slice(0,4));
  const seatList=r=>r.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,taken:!!r.seats[p.id].conn}));

  function viewFor(room,role,seatId){
    const m={t:'state',code:room.code,role,seat:seatId||null,revision:room.state.revision,state:sanitize(room.state),seats:seatList(room),hostOnline:!!room.host.conn};
    if(role==='seat')m.private=getPrivateState(room.state,seatId);
    return m;
  }
  function broadcast(room){
    if(room.host.conn)room.host.conn.send(viewFor(room,'host'));
    for(const [id,s] of Object.entries(room.seats))if(s.conn)s.conn.send(viewFor(room,'seat',id));
    for(const c of room.spectators)c.send(viewFor(room,'spectator'));
  }
  function attachHost(room,conn){room.host.conn?.close(4001);room.host.conn=conn;conn.ctx={room,role:'host'};room.lastActive=now()}
  function attachSeat(room,id,conn){const s=room.seats[id];s.conn?.close(4001);s.conn=conn;conn.ctx={room,role:'seat',seat:id};room.lastActive=now()}

  /** Obsługa jednej wiadomości. Zwraca nic; odpowiada przez conn.send. */
  function handle(conn,msg){
    const fail=text=>conn.send({t:'error',message:text});
    if(msg.t==='ping'){return conn.send({t:'pong'})}
    if(msg.t==='create'){
      if(conn.ctx)return fail('Już jesteś w pokoju');
      let room;try{room=create(msg.setup)}catch(e){return fail(e.message)}
      attachHost(room,conn);
      conn.send({t:'created',code:room.code,hostToken:room.hostToken});broadcast(room);return;
    }
    if(msg.t==='peek'){const r=get(msg.code);return r?conn.send({t:'seats',code:r.code,world:r.state.worldName||r.state.worldId,seats:seatList(r),started:true}):fail('Nie ma takiego pokoju')}
    if(msg.t==='resume'){
      const r=get(msg.code);if(!r)return fail('Pokój wygasł lub nie istnieje');
      if(conn.ctx)return fail('Już jesteś w pokoju');
      if(typeof msg.token==='string'&&eq(msg.token,r.hostToken)){attachHost(r,conn);conn.send({t:'resumed',code:r.code,role:'host'});return broadcast(r)}
      const id=r.players.find(p=>r.seats[p.id].token&&typeof msg.token==='string'&&eq(msg.token,r.seats[p.id].token))?.id;
      if(id){attachSeat(r,id,conn);conn.send({t:'resumed',code:r.code,role:'seat',seat:id});return broadcast(r)}
      return fail('Sesja nieważna — dołącz ponownie');
    }
    if(msg.t==='join'){
      const r=get(msg.code);if(!r)return fail('Nie ma takiego pokoju');
      if(conn.ctx)return fail('Już jesteś w pokoju');
      if(msg.spectate){if(r.spectators.size>=MAX_PER_ROOM_CONN)return fail('Za dużo widzów');r.spectators.add(conn);conn.ctx={room:r,role:'spectator'};conn.send({t:'joined',code:r.code,role:'spectator'});return conn.send(viewFor(r,'spectator'))}
      const s=r.seats[msg.playerId];if(!s)return fail('Nie ma takiego miejsca');
      if(s.conn&&!s.conn.closed)return fail('To miejsce jest zajęte przez inny telefon');
      s.token=token();attachSeat(r,msg.playerId,conn);
      conn.send({t:'joined',code:r.code,role:'seat',seat:msg.playerId,token:s.token});return broadcast(r);
    }
    if(msg.t==='cmd'){
      const {room,role,seat}=conn.ctx||{};if(!room)return fail('Najpierw dołącz do pokoju');
      const err=authorize(role,seat,room.state,msg.command);if(err)return conn.send({t:'rejected',commandId:msg.command?.commandId,message:err});
      try{const r=dispatch(room.state,msg.command);room.state=r.state;room.lastActive=now();room.dirty=true}
      catch(e){return conn.send({t:'rejected',commandId:msg.command.commandId,message:e.message})}
      return broadcast(room);
    }
    fail('Nieznana wiadomość');
  }
  function onClose(conn){
    const c=conn.ctx;if(!c)return;const {room,role,seat}=c;
    if(role==='host'&&room.host.conn===conn)room.host.conn=null;
    else if(role==='seat'&&room.seats[seat].conn===conn)room.seats[seat].conn=null;
    else room.spectators.delete(conn);
    broadcast(room);
  }
  function sweep(){for(const [c,r] of rooms)if(now()-r.lastActive>ROOM_TTL_MS)rooms.delete(c)}
  function dump(){return {v:1,engine:ENGINE_VERSION,rooms:[...rooms.values()].map(r=>({code:r.code,hostToken:r.hostToken,players:r.players,seatTokens:Object.fromEntries(Object.entries(r.seats).map(([k,s])=>[k,s.token])),state:snapshot(r.state),createdAt:r.createdAt,lastActive:r.lastActive}))}}
  function load(data){
    if(data?.engine!==ENGINE_VERSION)return 0;let n=0;
    for(const d of data.rooms||[]){try{
      const state=restore(d.state);
      rooms.set(d.code,{code:d.code,hostToken:d.hostToken,players:d.players,state,seats:Object.fromEntries(d.players.map(p=>[p.id,{token:d.seatTokens?.[p.id]||null,conn:null}])),host:{conn:null},spectators:new Set(),createdAt:d.createdAt,lastActive:d.lastActive,dirty:false});n++;
    }catch{}}
    return n;
  }
  return {rooms,create,get,handle,onClose,sweep,dump,load,broadcast,stats:()=>({rooms:rooms.size})};
}
