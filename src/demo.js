import fs from 'node:fs';import {createGame,dispatch,getPublicState} from './engine.js';
const events=JSON.parse(fs.readFileSync(new URL('../data/03_Wydarzenia_i_Karty_Specjalne/wydarzenia_60.json',import.meta.url)));
const cards=JSON.parse(fs.readFileSync(new URL('../data/01_Biblioteka_Kart/karty_250.json',import.meta.url)));
let s=createGame({players:[{id:'p1',name:'Ala'},{id:'p2',name:'Bartek'},{id:'p3',name:'Celina'}],worldId:'W01',worldName:'Wyspa Rozbitków',cards,events,seed:20261112});
let i=0;const cmd=(type,extra={})=>{s=dispatch(s,{type,commandId:`demo-${++i}`,...extra}).state;};
cmd('ROLL');cmd('CONFIRM_ROLL');while(s.phase==='PATH_CHOICE')cmd('CHOOSE_PATH',{nodeId:s.pendingChoices[0]});if(s.phase==='CARD_READY')cmd('CONFIRM_READY');if(s.phase==='CARD_ACTIVE')cmd('RESOLVE_CARD',{outcome:'success'});if(s.phase==='STEP_COMPLETE')cmd('END_TURN');
console.log(JSON.stringify(getPublicState(s),null,2));
