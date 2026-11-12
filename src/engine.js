import {createRng,shuffle} from './rng.js';
import {buildBoard,validateBoard} from './board.js';
import {createDeck,drawCard,skipDrawnCard} from './deck.js';
import {scenarioFor,finaleEligibility,awardAchievements,advanceObjectivesFromCard} from './scenario.js';

export const ENGINE_VERSION='1.4.0';
const clone=x=>structuredClone(x);
const assert=(ok,msg)=>{if(!ok) throw new Error(msg);};
function pushEvent(s,type,payload={}) { s.revision++; s.history.push({seq:s.revision,type,atTurn:s.turnNumber,payload:clone(payload)}); }
function currentPlayer(s){return s.players[s.activeIndex];}
function nodeOf(s,id){return s.board.nodes.find(n=>n.id===id);}
function nextActive(s){s.activeIndex=(s.activeIndex+1)%s.players.length;if(s.activeIndex===0)s.round++;s.turnNumber++;if(s.round>s.scenario.maxRounds){s.phase='FINISHED';s.result='ROUND_LIMIT';s.winners=[];pushEvent(s,'ROUND_LIMIT_REACHED',{maxRounds:s.scenario.maxRounds});return;}s.phase='TURN_START';s.pendingSteps=0;s.pendingChoices=null;s.activeCard=null;s.resolution=null;}
function setFinish(s){s.finishedAtTurn=s.turnNumber;const sorted=[...s.players].sort((a,b)=>b.score-a.score||b.completedObjectives-a.completedObjectives||b.teamPoints-a.teamPoints);const top=sorted[0],tied=sorted.filter(p=>p.score===top.score&&p.completedObjectives===top.completedObjectives&&p.teamPoints===top.teamPoints);if(tied.length>1){s.phase='TIEBREAK';s.tiedPlayers=tied.map(p=>p.id);pushEvent(s,'TIEBREAK_REQUIRED',{playerIds:s.tiedPlayers,criteria:['score','completedObjectives','teamPoints']});return;}s.phase='FINISHED';s.winners=[top.id];pushEvent(s,'GAME_FINISHED',{winners:s.winners,teamResource:s.teamResource});}
function checkpoint(s,nodeId){if(s.board.checkpoints.includes(nodeId)&&!s.checkpoints.includes(nodeId)){s.checkpoints.push(nodeId);pushEvent(s,'CHECKPOINT_REACHED',{nodeId,teamResource:s.teamResource,scoreboard:s.players.map(p=>({id:p.id,score:p.score}))});}}
function activateNode(s,nodeId){const n=nodeOf(s,nodeId); if(!n) throw new Error('Nieznane pole');
 s.positionByPlayer[currentPlayer(s).id]=nodeId; pushEvent(s,'NODE_ENTERED',{playerId:currentPlayer(s).id,nodeId,nodeType:n.type}); checkpoint(s,nodeId);
 if(n.type==='FINISH'||n.type==='FINAL') { s.phase='FINALE';s.activeCard=null;pushEvent(s,'FINALE_STARTED',{worldId:s.worldId,eligibility:finaleEligibility(s)});return; }
 if(['REST','TREASURE'].includes(n.type)){if(n.type==='REST'){s.teamResource=Math.min(s.teamResourceMax,s.teamResource+1);pushEvent(s,'REST_USED',{resource:s.teamResource});}else{currentPlayer(s).specialCards.push('TREASURE_TOKEN');currentPlayer(s).score+=1;pushEvent(s,'TREASURE_FOUND',{playerId:currentPlayer(s).id});} s.phase='STEP_COMPLETE';return;}
 if(n.type==='CHECKPOINT'){s.phase='STEP_COMPLETE';return;}
 if(n.type==='EVENT'){
  const available=s.eventDeck.filter(e=>!s.usedEventIds.includes(e.id));
  const ev=available[0];
  if(ev){s.usedEventIds.push(ev.id);s.activeEvent=clone(ev);let effect='NO_EFFECT';
   if(ev.effectType==='resource'){s.teamResource=Math.min(s.teamResourceMax,s.teamResource+1);effect='RESOURCE_PLUS_ONE';}
   else if(ev.effectType==='clue'){s.clues=(s.clues||0)+1;effect='CLUE_PLUS_ONE';}
   else if(ev.effectType==='memory'){s.clues=(s.clues||0)+1;effect='MEMORY_CLUE';}
   else if(ev.effectType==='modifier'){s.activeModifier={id:ev.id,type:'CALM_NEXT_CARD',remaining:1};effect='CALM_NEXT_CARD';}
   else if(ev.effectType==='route'){s.routeSkipAvailable=true;effect='ROUTE_SKIP_TOKEN';}
   pushEvent(s,'EVENT_RESOLVED',{eventId:ev.id,effectType:ev.effectType,effect,teamResource:s.teamResource,clues:s.clues||0});
  }
  s.phase='STEP_COMPLETE';return;
 }
 const cats=n.type==='DUEL'?['NEGOCJACJE_I_BLEF','ZGADYWANIE_I_OPIS']:null;
 const intensityCap=s.activeModifier?.type==='CALM_NEXT_CARD'?Math.min(s.settings.intensityMax,1):s.settings.intensityMax;
 const result=drawCard(s.deck,{playerCount:s.players.length,worldId:s.worldId,intensityMax:intensityCap,allowedCategories:cats,propsAvailable:s.settings.propsAvailable});
 if(s.activeModifier?.type==='CALM_NEXT_CARD')s.activeModifier=null;
 s.deck=result.deck;
 if(!result.card){s.phase='STEP_COMPLETE';pushEvent(s,'CARD_POOL_EMPTY',{nodeId,reason:result.reason});return;}
 s.activeCard=clone(result.card);s.phase='CARD_READY';pushEvent(s,'CARD_DRAWN',{cardId:result.card.id,nodeId,playerId:currentPlayer(s).id});
}
function applyOutcome(s,outcome,playerIds,kind){
 const ids=playerIds?.length?playerIds:[currentPlayer(s).id];
 let actualDelta=Number(outcome?.resourceDelta||0);
 if(actualDelta<0){const shieldOwner=ids.map(id=>s.players.find(p=>p.id===id)).find(p=>p?.shield);if(shieldOwner){shieldOwner.shield=false;actualDelta=0;pushEvent(s,'SHIELD_BLOCKED_RESOURCE_LOSS',{playerId:shieldOwner.id});}}
 const points=Number(outcome?.points||0), delta=Number(outcome?.resourceDelta||0);
 for(const id of ids){const p=s.players.find(x=>x.id===id);if(p){p.score+=points;p.completedObjectives+=kind==='success'?1:0;if(kind==='success'&&s.mode==='COOPERATIVE')p.teamPoints+=points;}}
 s.teamResource=Math.max(0,Math.min(s.teamResourceMax,s.teamResource+actualDelta));
 pushEvent(s,'OUTCOME_APPLIED',{kind,playerIds:ids,pointsPerPlayer:points,resourceDelta:actualDelta,teamResource:s.teamResource});
 if(s.teamResource<=0&&s.scenario.failureOnResourceDepletion){s.phase='FINISHED';s.winners=[];s.result='DEFEAT';pushEvent(s,'SCENARIO_DEFEAT',{reason:'RESOURCE_DEPLETED',worldId:s.worldId});return;}
 if(['COOPERATIVE','MIXED'].includes(s.mode)&&s.teamResource<=0){s.phase='FINISHED';s.winners=[];s.result='DEFEAT';pushEvent(s,'COOPERATIVE_DEFEAT',{reason:'TEAM_RESOURCE_DEPLETED'});return;}
 s.resolution={kind,playerIds:ids,points,resourceDelta:delta};s.phase='STEP_COMPLETE';
}
export function createGame({players,worldId,worldName='',cards,events=[],missions=[],seed=1,mode='COMPETITIVE',settings={}}){
 assert(Array.isArray(players)&&players.length>=2&&players.length<=10,'Gra wymaga od 2 do 10 graczy');
 assert(new Set(players.map(p=>p.id)).size===players.length,'Identyfikatory graczy muszą być unikalne');
 assert(players.every(p=>p.id&&p.name),'Każdy gracz musi mieć id i nazwę');
 assert(['COMPETITIVE','COOPERATIVE','MIXED'].includes(mode),'Nieznany tryb gry');
 const board=buildBoard(worldId,worldName), bv=validateBoard(board);assert(bv.valid,`Nieprawidłowa plansza: ${bv.errors.join('; ')}`);
 const rng=createRng(seed), ordered=shuffle(players.map(p=>({id:p.id,name:p.name,score:0,completedObjectives:0,teamPoints:0,specialCards:[],secretMission:null})),rng);
 const missionPool=shuffle(missions.filter(m=>m.status==='approved'&&m.playerMin<=players.length&&m.playerMax>=players.length),rng);
 if(settings.secretMissionsEnabled) ordered.forEach((p,i)=>{if(missionPool[i])p.secretMission=clone(missionPool[i]);});
 const state={scenario:scenarioFor(worldId),objectiveProgress:{},successfulCards:0,successCategories:[],teamCardSuccesses:0,failedCards:0,finaleFailures:0,achievements:[],engineVersion:ENGINE_VERSION,sessionId:`IE-${worldId}-${(seed>>>0).toString(16)}`,worldId,worldName,mode,seed:seed>>>0,rngState:rng.getState(),board,players:ordered,activeIndex:0,round:1,turnNumber:1,phase:'TURN_START',pendingSteps:0,pendingChoices:null,activeCard:null,resolution:null,positionByPlayer:Object.fromEntries(ordered.map(p=>[p.id,board.startNode])),teamResource:Number(settings.startingResource??5),teamResourceMax:Number(settings.teamResourceMax??10),scenarioFailureCount:0,checkpoints:[],settings:{intensityMax:3,propsAvailable:[],...settings},deck:createDeck(cards,rng),eventDeck:shuffle(events.filter(e=>e.worldId===worldId&&e.status==='approved'),rng),usedEventIds:[],activeEvent:null,clues:0,routeSkipAvailable:false,activeModifier:null,history:[],revision:0,processedCommandIds:[],winners:[],result:null,createdAt:new Date().toISOString()};
 state.scenario.failureOnResourceDepletion=!!state.scenario.failureOnResourceDepletion;assert(state.teamResource>=0&&state.teamResource<=state.teamResourceMax,'Nieprawidłowy początkowy zasób');pushEvent(state,'GAME_CREATED',{worldId,mode,playerOrder:ordered.map(p=>p.id),seed:state.seed});return state;
}
function applyOne(s,command){
 const actor=currentPlayer(s);
 switch(command.type){
 case 'ROLL': {
  assert(s.phase==='TURN_START','Rzut jest możliwy wyłącznie na początku tury');
  const rng=createRng(s.rngState);const roll=rng.int(1,6);s.rngState=rng.getState();s.lastRoll=roll;s.phase='ROLL_REVIEW';pushEvent(s,'DICE_ROLLED',{playerId:actor.id,value:roll});
  return;
 }
 case 'CONFIRM_ROLL': {
  assert(s.phase==='ROLL_REVIEW','Nie ma rzutu oczekującego na zatwierdzenie');s.pendingSteps=s.lastRoll;s.phase='MOVING';pushEvent(s,'ROLL_CONFIRMED',{playerId:actor.id,value:s.lastRoll});return advanceMovement(s);
 }
 case 'REROLL': {
  assert(s.phase==='ROLL_REVIEW','Przerzut jest możliwy wyłącznie przed ruchem');const ix=actor.specialCards.indexOf('PRZERZUT');assert(ix>=0,'Gracz nie posiada karty PRZERZUT');actor.specialCards.splice(ix,1);const rng=createRng(s.rngState);const previous=s.lastRoll;s.lastRoll=rng.int(1,6);s.rngState=rng.getState();s.pendingSteps=s.lastRoll;s.phase='MOVING';pushEvent(s,'DICE_REROLLED',{playerId:actor.id,previous,value:s.lastRoll,cardId:'PRZERZUT'});return advanceMovement(s);
 }
 case 'CHOOSE_PATH': {
  assert(s.phase==='PATH_CHOICE'&&s.pendingChoices,'Obecnie nie ma rozwidlenia do wyboru');
  assert(s.pendingChoices.includes(command.nodeId),'Wybrana droga nie jest dostępna');
  const chosen=command.nodeId;s.pendingChoices=null;s.pendingSteps--;activateNode(s,chosen);if(s.phase==='STEP_COMPLETE'&&s.pendingSteps>0){s.phase='MOVING';return advanceMovement(s);}return;
 }
 case 'CONFIRM_READY': {
  assert(s.phase==='CARD_READY','Nie ma karty oczekującej na potwierdzenie');s.phase='CARD_ACTIVE';pushEvent(s,'CARD_CONFIRMED',{cardId:s.activeCard.id});return;
 }
 case 'RESOLVE_CARD': {
  assert(s.phase==='CARD_ACTIVE','Karta nie jest aktywna');assert(['success','failure','neutral'].includes(command.outcome),'Nieznany wynik karty');
  const card=s.activeCard;const out=command.outcome==='success'?card.successOutcome:command.outcome==='failure'?card.failureOutcome:{points:0,resourceDelta:0};
  if(command.outcome==='neutral') {pushEvent(s,'CARD_NEUTRAL',{cardId:card.id});s.phase='STEP_COMPLETE';s.resolution={kind:'neutral',points:0,resourceDelta:0};}
  else applyOutcome(s,out,command.playerIds||[currentPlayer(s).id],command.outcome);
  if(command.outcome==='success'){s.successfulCards++;if(!s.successCategories.includes(card.category))s.successCategories.push(card.category);if(card.category==='WSPÓŁPRACA'||nodeOf(s,s.positionByPlayer[actor.id])?.type==='TEAM')s.teamCardSuccesses++;const advanced=advanceObjectivesFromCard(s,card,(type,payload)=>pushEvent(s,type,payload));if(advanced.length)pushEvent(s,'SCENARIO_PROGRESS_FROM_CARD',{cardId:card.id,objectiveIds:advanced});awardAchievements(s,(type,payload)=>pushEvent(s,type,payload));}
  if(command.outcome==='failure'){s.failedCards++;}
  if(s.activeCollaborator){pushEvent(s,'COOPERATIVE_PARTNER_ASSISTED',{playerId:currentPlayer(s).id,partnerId:s.activeCollaborator,cardId:card.id});s.activeCollaborator=null;}
  return;
 }
 case 'SKIP_CARD': {
  assert(['CARD_READY','CARD_ACTIVE'].includes(s.phase),'Nie ma karty do pominięcia');const card=s.activeCard;s.deck=skipDrawnCard(s.deck,card);s.activeCard=null;s.phase='STEP_COMPLETE';s.resolution={kind:'skip',points:0,resourceDelta:0};pushEvent(s,'CARD_SKIPPED',{cardId:card.id,playerId:actor.id});return;
 }
 case 'USE_SPECIAL': {
  const p=s.players.find(x=>x.id===command.playerId)||actor;const ix=p.specialCards.indexOf(command.cardId);assert(ix>=0,'Gracz nie posiada tej karty specjalnej');
  if(command.cardId==='TARCZA'){p.specialCards.splice(ix,1);p.shield=true;pushEvent(s,'SPECIAL_USED',{playerId:p.id,cardId:command.cardId});return;}
  if(command.cardId==='SKROT'){assert(s.phase==='PATH_CHOICE','SKRÓT wymaga aktywnego rozwidlenia');assert(s.pendingChoices.includes(command.nodeId),'Skrót wskazuje niedostępną drogę');p.specialCards.splice(ix,1);pushEvent(s,'SPECIAL_USED',{playerId:p.id,cardId:command.cardId,nodeId:command.nodeId});return applyOne(s,{type:'CHOOSE_PATH',nodeId:command.nodeId,commandId:`${command.commandId}:path`});}
  if(command.cardId==='REZERWA'){s.teamResource=Math.min(s.teamResourceMax,s.teamResource+1);p.specialCards.splice(ix,1);pushEvent(s,'SPECIAL_USED',{playerId:p.id,cardId:command.cardId,teamResource:s.teamResource});return;}
  if(command.cardId==='KOMPAS'){const at=s.positionByPlayer[p.id];const candidates=s.board.checkpoints.filter(id=>!s.checkpoints.includes(id));const distance=id=>{let q=[[at,0]],seen=new Set([at]);while(q.length){const [cur,d]=q.shift();if(cur===id)return d;for(const next of nodeOf(s,cur).edges)if(!seen.has(next)){seen.add(next);q.push([next,d+1]);}}return Infinity;};const target=candidates.sort((a,b)=>distance(a)-distance(b))[0]||null;const clue={id:`CLUE-${s.revision+1}`,checkpointId:target,text:target?`Najbliższy niezdobyty checkpoint znajduje się ${distance(target)} pól od obecnej pozycji.`:'Wszystkie checkpointy zostały zdobyte.',createdAtTurn:s.turnNumber};s.clueLog=s.clueLog||[];s.clueLog.push(clue);s.clues=(s.clues||0)+1;p.specialCards.splice(ix,1);pushEvent(s,'SPECIAL_USED',{playerId:p.id,cardId:command.cardId,clue});return;}
  if(command.cardId==='ZWIADOWCA'){const at=s.positionByPlayer[p.id];const first=nodeOf(s,at).edges;const preview=[];for(const id of first){const n=nodeOf(s,id);preview.push({id:n.id,type:n.type,depth:1});for(const next of n.edges){const nn=nodeOf(s,next);if(!preview.some(x=>x.id===nn.id))preview.push({id:nn.id,type:nn.type,depth:2});}}s.scoutPreview=preview;p.specialCards.splice(ix,1);pushEvent(s,'SPECIAL_USED',{playerId:p.id,cardId:command.cardId,preview:s.scoutPreview});return;}
  if(command.cardId==='ZAMROŻENIE'){assert(['CARD_READY','CARD_ACTIVE'].includes(s.phase),'ZAMROŻENIE wymaga aktywnej karty');s.timerExtensionSec=Math.min(20,(s.timerExtensionSec||0)+20);p.specialCards.splice(ix,1);pushEvent(s,'SPECIAL_USED',{playerId:p.id,cardId:command.cardId,extensionSec:20});return;}
  if(command.cardId==='WSPÓŁPRACA'){assert(['CARD_READY','CARD_ACTIVE'].includes(s.phase),'WSPÓŁPRACA wymaga aktywnej karty');assert(command.partnerId&&command.partnerId!==p.id&&s.players.some(x=>x.id===command.partnerId),'Wskaż innego gracza');s.activeCollaborator=command.partnerId;p.specialCards.splice(ix,1);pushEvent(s,'SPECIAL_USED',{playerId:p.id,partnerId:command.partnerId,cardId:command.cardId});return;}
  if(command.cardId==='JOKER'){assert(s.phase==='CARD_READY'&&s.activeCard,'JOKER można użyć przed ujawnieniem instrukcji');s.specialUseLedger=s.specialUseLedger||{};assert(!s.specialUseLedger[`${s.sessionId}:${p.id}:JOKER`],'JOKER można użyć tylko raz na scenariusz');assert(command.category&&command.category!==s.activeCard.category,'Wybierz inną kategorię');const old=s.activeCard;s.deck.discard.push(old.id);const result=drawCard(s.deck,{playerCount:s.players.length,worldId:s.worldId,intensityMax:s.settings.intensityMax,allowedCategories:[command.category],propsAvailable:s.settings.propsAvailable});assert(result.card,'Brak dostępnej karty w wybranej kategorii');s.deck=result.deck;s.activeCard=clone(result.card);p.specialCards.splice(ix,1);s.specialUseLedger[`${s.sessionId}:${p.id}:JOKER`]=true;pushEvent(s,'SPECIAL_USED',{playerId:p.id,cardId:command.cardId,replacedCardId:old.id,newCardId:result.card.id,category:command.category});return;}
  throw new Error('Nieobsługiwany efekt karty specjalnej');
 }
 case 'TIMER_START': { assert(s.phase==='CARD_ACTIVE','Licznik można uruchomić tylko dla aktywnej karty');assert(!s.cardTimer?.running,'Licznik już działa');const duration=Number(s.activeCard.durationSec||0)+Number(s.timerExtensionSec||0);assert(duration>0,'Karta nie ma poprawnego czasu');s.cardTimer={running:true,durationSec:duration,remainingSec:duration,startedAt:command.nowMs??Date.now()};pushEvent(s,'CARD_TIMER_STARTED',{cardId:s.activeCard.id,durationSec:duration});return; }
 case 'TIMER_PAUSE': { assert(s.cardTimer?.running,'Licznik nie jest uruchomiony');const now=Number(command.nowMs??Date.now());const elapsed=Math.max(0,Math.floor((now-s.cardTimer.startedAt)/1000));s.cardTimer.remainingSec=Math.max(0,s.cardTimer.remainingSec-elapsed);s.cardTimer.running=false;s.cardTimer.pausedAt=now;pushEvent(s,'CARD_TIMER_PAUSED',{remainingSec:s.cardTimer.remainingSec});return; }
 case 'TIMER_RESUME': { assert(s.cardTimer&&!s.cardTimer.running&&s.cardTimer.remainingSec>0,'Nie można wznowić licznika');s.cardTimer.running=true;s.cardTimer.startedAt=Number(command.nowMs??Date.now());pushEvent(s,'CARD_TIMER_RESUMED',{remainingSec:s.cardTimer.remainingSec});return; }
 case 'TIMER_STOP': { assert(s.cardTimer,'Brak licznika aktywnej karty');if(s.cardTimer.running){const now=Number(command.nowMs??Date.now());const elapsed=Math.max(0,Math.floor((now-s.cardTimer.startedAt)/1000));s.cardTimer.remainingSec=Math.max(0,s.cardTimer.remainingSec-elapsed);}s.cardTimer.running=false;s.cardTimer.stopped=true;pushEvent(s,'CARD_TIMER_STOPPED',{remainingSec:s.cardTimer.remainingSec,expired:s.cardTimer.remainingSec===0});return; }
 case 'PAUSE': assert(!['FINISHED','PAUSED'].includes(s.phase),'Nie można wstrzymać gry w tym stanie');s.pausedPhase=s.phase;s.phase='PAUSED';pushEvent(s,'GAME_PAUSED',{phase:s.pausedPhase});return;
 case 'RESUME': assert(s.phase==='PAUSED','Gra nie jest wstrzymana');s.phase=s.pausedPhase;s.pausedPhase=null;pushEvent(s,'GAME_RESUMED',{phase:s.phase});return;
 case 'END_TURN': {
  assert(s.phase==='STEP_COMPLETE','Tura nie jest gotowa do zakończenia');
  if(s.pendingSteps>0){s.phase='MOVING';return advanceMovement(s);} 
  s.lastTurnSummary={playerId:actor.id,score:actor.score,position:s.positionByPlayer[actor.id]};pushEvent(s,'TURN_ENDED',s.lastTurnSummary);nextActive(s);return;
 }
 case 'START_VOTE': {
  assert(!s.vote||s.vote.status!=='OPEN','Głosowanie już trwa');const eligible=command.eligiblePlayerIds||s.players.map(p=>p.id);assert(eligible.length>=2&&eligible.every(id=>s.players.some(p=>p.id===id)),'Nieprawidłowa lista głosujących');s.vote={id:command.voteId||`V-${s.revision+1}`,status:'OPEN',eligiblePlayerIds:[...new Set(eligible)],votes:{},allowSelfVote:!!command.allowSelfVote,subject:command.subject||'Rozstrzygnięcie karty'};pushEvent(s,'VOTE_STARTED',{voteId:s.vote.id,eligiblePlayerIds:s.vote.eligiblePlayerIds,subject:s.vote.subject});return;
 }
 case 'CAST_VOTE': {
  assert(s.vote?.status==='OPEN','Brak aktywnego głosowania');assert(s.vote.eligiblePlayerIds.includes(command.voterId),'Gracz nie jest uprawniony do głosowania');assert(s.vote.eligiblePlayerIds.includes(command.choiceId),'Wybrana osoba nie jest uprawniona');assert(s.vote.allowSelfVote||command.voterId!==command.choiceId,'Samogłosowanie jest wyłączone');assert(!(command.voterId in s.vote.votes),'Ten gracz już oddał głos');s.vote.votes[command.voterId]=command.choiceId;pushEvent(s,'VOTE_CAST',{voteId:s.vote.id,voterId:command.voterId});return;
 }
 case 'CLOSE_VOTE': {
  assert(s.vote?.status==='OPEN','Brak aktywnego głosowania');const counts={};for(const choice of Object.values(s.vote.votes))counts[choice]=(counts[choice]||0)+1;const max=Math.max(0,...Object.values(counts));const winners=Object.keys(counts).filter(id=>counts[id]===max&&max>0);s.vote={...s.vote,status:'CLOSED',counts,result:winners.length===1?winners[0]:null,tied:winners.length>1?winners:[]};pushEvent(s,'VOTE_CLOSED',{voteId:s.vote.id,counts,result:s.vote.result,tied:s.vote.tied});return;
 }
 case 'RESOLVE_SECRET_MISSION': {
  const p=s.players.find(x=>x.id===command.playerId);assert(p?.secretMission,'Gracz nie ma aktywnej tajnej misji');assert(['success','failure','skip'].includes(command.outcome),'Nieznany wynik misji');const m=p.secretMission;const out=command.outcome==='success'?m.successOutcome:command.outcome==='failure'?m.failureOutcome:m.skipOutcome;p.score+=Number(out?.points||0);p.completedObjectives+=command.outcome==='success'?1:0;p.secretMission=null;pushEvent(s,'SECRET_MISSION_RESOLVED',{playerId:p.id,missionId:m.id,outcome:command.outcome,points:Number(out?.points||0)});return;
 }
 case 'ADVANCE_OBJECTIVE': {
  assert(!['FINISHED','PAUSED','TIEBREAK'].includes(s.phase),'Nie można realizować celu w tej fazie');
  const objective=s.scenario.objectives.find(o=>o.id===command.objectiveId);assert(objective,'Nieznany cel scenariusza');
  assert(command.evidence&&typeof command.evidence==='string'&&command.evidence.trim().length>=3,'Cel wymaga jawnego opisu dowodu');
  assert(Number.isInteger(command.amount)&&command.amount===1,'Postęp celu zwiększa się o jeden');
  const previous=s.objectiveProgress[objective.id]||0;assert(previous<objective.required,'Cel został już wykonany');
  s.objectiveProgress[objective.id]=previous+1;pushEvent(s,'OBJECTIVE_ADVANCED',{objectiveId:objective.id,progress:previous+1,required:objective.required,evidence:command.evidence});return;
 }
 case 'RESOLVE_TIEBREAK': {
  assert(s.phase==='TIEBREAK','Dogrywka nie jest aktywna');const winnerIds=command.winnerIds||[];assert(winnerIds.length>0&&winnerIds.every(id=>s.tiedPlayers.includes(id)),'Zwycięzca dogrywki musi należeć do remisujących');s.winners=[...new Set(winnerIds)];s.phase='FINISHED';pushEvent(s,'TIEBREAK_RESOLVED',{winners:s.winners,method:command.method||'challenge'});return;
 }
 case 'RESOLVE_FINALE': {
  assert(s.phase==='FINALE','Finał nie jest aktywny');assert(['success','failure'].includes(command.outcome),'Finał wymaga sukcesu lub porażki');
  const eligibility=finaleEligibility(s);assert(command.outcome!=='success'||eligibility.ready,'Warunki scenariusza nie zostały spełnione');
  if(command.outcome==='failure'){
   s.finaleFailures=(s.finaleFailures||0)+1;
   const limit=s.scenario.finaleFailureLimit;
   if(Number.isInteger(limit)&&s.finaleFailures<limit){pushEvent(s,'FINALE_ATTEMPT_FAILED',{attempt:s.finaleFailures,remaining:limit-s.finaleFailures});return;}
   s.phase='FINISHED';s.result='DEFEAT';s.winners=[];pushEvent(s,'SCENARIO_DEFEAT',{reason:'FINALE_FAILED',attempts:s.finaleFailures});return;
  }
  if(s.mode==='COOPERATIVE'||s.mode==='MIXED'){
   s.result='VICTORY';s.winners=s.players.map(p=>p.id);s.phase='FINISHED';
   if(s.mode==='MIXED'){const ranking=[...s.players].sort((a,b)=>b.score-a.score||b.completedObjectives-a.completedObjectives);s.individualWinners=ranking.filter(p=>p.score===ranking[0].score&&p.completedObjectives===ranking[0].completedObjectives).map(p=>p.id);}
   awardAchievements(s,(type,payload)=>pushEvent(s,type,payload));pushEvent(s,'COOPERATIVE_FINALE_RESOLVED',{outcome:'success',individualWinners:s.individualWinners||[]});
  } else {
   const ids=command.playerIds?.length?command.playerIds:s.players.map(p=>p.id);const points=Number(command.points??5);
   for(const id of ids){const p=s.players.find(x=>x.id===id);assert(p,'Nieznany gracz finału');p.score+=points;p.completedObjectives++;}
   pushEvent(s,'FINALE_SCORED',{outcome:'success',playerIds:ids,points});setFinish(s);if(s.phase==='FINISHED'){s.result='VICTORY';awardAchievements(s,(type,payload)=>pushEvent(s,type,payload));}
  }
  return;
 }

 default: throw new Error(`Nieobsługiwana komenda: ${command.type}`);
 }
}
function advanceMovement(s){
 while(s.pendingSteps>0&&s.phase==='MOVING'){
  const at=s.positionByPlayer[currentPlayer(s).id], node=nodeOf(s,at);
  if(node.type==='START'&&s.pendingSteps>0) { /* start ma jedno wyjście */ }
  const choices=node.edges;
  assert(choices.length>0,'Nie można wykonać ruchu: brak dalszej drogi');
  if(choices.length>1){s.pendingChoices=[...choices];s.phase='PATH_CHOICE';pushEvent(s,'PATH_CHOICE_REQUIRED',{from:at,choices:s.pendingChoices,stepsRemaining:s.pendingSteps});return;}
  let target=choices[0];
  if(s.routeSkipAvailable){const candidate=nodeOf(s,target);const ordinary=['CHALLENGE','DUEL','TEAM','BLUFF','IMPROV','REFLEX'];if(candidate&&ordinary.includes(candidate.type)&&candidate.edges.length===1){const skipped=target;target=candidate.edges[0];s.routeSkipAvailable=false;pushEvent(s,'ROUTE_FIELD_SKIPPED',{skippedNodeId:skipped,targetNodeId:target});}}
  s.pendingSteps--;activateNode(s,target);
  if(s.phase==='CARD_READY'||s.phase==='FINALE'||s.phase==='STEP_COMPLETE'||s.phase==='FINISHED')return;
 }
 if(s.pendingSteps===0&&s.phase==='MOVING')s.phase='STEP_COMPLETE';
}
export function dispatch(state,command){
 assert(state&&state.engineVersion===ENGINE_VERSION,'Nieobsługiwana wersja stanu gry');assert(command&&command.type&&command.commandId,'Każda komenda wymaga type i commandId');
 if(state.processedCommandIds.includes(command.commandId)) return {state:clone(state),duplicate:true};
 const next=clone(state);applyOne(next,command);next.processedCommandIds.push(command.commandId);if(next.processedCommandIds.length>5000)next.processedCommandIds=next.processedCommandIds.slice(-4000);return {state:next,duplicate:false};
}
export function snapshot(state){return clone(state);}
export function restore(snapshotData){assert(snapshotData?.engineVersion===ENGINE_VERSION,'Nieobsługiwana wersja zapisu');const boardCheck=validateBoard(snapshotData.board);assert(boardCheck.valid,'Zapis zawiera uszkodzoną planszę');assert(snapshotData.players.length>=2&&snapshotData.players.length<=10,'Zapis ma nieprawidłową liczbę graczy');return clone(snapshotData);}
export function getPublicState(state){return {sessionId:state.sessionId,worldId:state.worldId,worldName:state.worldName,mode:state.mode,revision:state.revision,round:state.round,turnNumber:state.turnNumber,phase:state.phase,activePlayerId:currentPlayer(state)?.id,players:state.players.map(({id,name,score,completedObjectives,teamPoints})=>({id,name,score,completedObjectives,teamPoints,position:state.positionByPlayer[id]})),teamResource:state.teamResource,failedCards:state.failedCards,finaleFailures:state.finaleFailures,scenario:structuredClone(state.scenario),objectiveProgress:structuredClone(state.objectiveProgress),finaleEligibility:finaleEligibility(state),achievements:[...state.achievements],individualWinners:state.individualWinners||[],checkpoints:[...state.checkpoints],activeCard:state.activeCard?(state.activeCard.privacyLevel==='prywatna'?{private:true,assignedTo:currentPlayer(state).id}:{id:state.activeCard.id,title:state.activeCard.title,category:state.activeCard.category,instructions:state.activeCard.instructions,durationSec:state.activeCard.durationSec}):null,board:state.board,activeEvent:state.activeEvent?{id:state.activeEvent.id,title:state.activeEvent.title,description:state.activeEvent.description,effectType:state.activeEvent.effectType}:null,clues:state.clues||0,scoutPreview:clone(state.scoutPreview||[]),timerExtensionSec:state.timerExtensionSec||0,cardTimer:state.cardTimer?structuredClone(state.cardTimer):null,clueLog:structuredClone(state.clueLog||[])};}
export function getPrivateState(state,playerId){const p=state.players.find(x=>x.id===playerId);assert(p,'Nieznany gracz');const ownCard=state.activeCard&&state.activeCard.privacyLevel==='prywatna'&&currentPlayer(state).id===playerId?clone(state.activeCard):null;return {playerId,secretMission:clone(p.secretMission),activePrivateCard:ownCard};}
