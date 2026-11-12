import {shuffle} from './rng.js';
export function createDeck(cards, rng) { return {drawPile:shuffle(cards.filter(c=>c.status==='approved'),rng),discard:[],usedIds:[],lastCategory:null}; }
export function drawCard(deck,{playerCount,worldId,intensityMax=3,allowedCategories=null,propsAvailable=[]}={}) {
 const allowed=new Set(allowedCategories||[]), props=new Set(propsAvailable);
 const eligible=deck.drawPile.filter(c=>c.playerMin<=playerCount&&c.playerMax>=playerCount&&c.worldIds.includes(worldId)&&c.intensity<=intensityMax&&(!allowed.size||allowed.has(c.category))&&(c.props||[]).every(p=>props.has(p)));
 if(!eligible.length) return {deck,card:null,reason:'NO_ELIGIBLE_CARD'};
 // Anti-repeat: jeżeli istnieje alternatywa kategorii, odsuń poprzednią kategorię.
 const varied=eligible.filter(c=>c.category!==deck.lastCategory); const pool=varied.length?varied:eligible;
 const chosen=pool[0];
 const next={...deck,drawPile:deck.drawPile.filter(c=>c.id!==chosen.id),usedIds:[...deck.usedIds,chosen.id],lastCategory:chosen.category};
 return {deck:next,card:chosen,reason:null};
}
export function skipDrawnCard(deck,card) { if(!card||!deck.usedIds.includes(card.id)) throw new Error('Nie można pominąć karty, która nie została dobrana'); return {...deck,discard:[...deck.discard,card.id]}; }
