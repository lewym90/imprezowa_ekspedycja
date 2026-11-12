// Test end-to-end w prawdziwej przeglądarce: pełna rozgrywka przez interfejs na kilku rozmiarach ekranu.
// Użycie: node tools/e2e.mjs [url]   (wymaga: npm run serve w drugim terminalu, Playwright, Chrome)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const URL=process.argv[2]||'http://localhost:4173/';const OUT='/tmp/e2e';fs.mkdirSync(OUT,{recursive:true});
const ALL={phone:[390,844,2,true],'phone-landscape':[844,390,2,true],tablet:[820,1180,1,true],laptop:[1440,900,1,false],tv:[1920,1080,1,false],'tv-4k':[3840,2160,1,false]};
const VPsel=process.env.ONLY?Object.fromEntries(process.env.ONLY.split(',').map(k=>[k,ALL[k]])):ALL;const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
let failed=0;
for(const [name,[w,h,d,m]] of Object.entries(VPsel)){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:d,isMobile:m,hasTouch:m});const p=await ctx.newPage();const errs=[];
  p.on('pageerror',e=>errs.push('PAGE '+e.message));p.on('console',x=>{if(x.type()==='error')errs.push('CONSOLE '+x.text())});p.on('dialog',x=>x.accept());
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.click('#newGame');await p.click('[data-world="W0'+(1+Object.keys(ALL).indexOf(name)%9)+'"]');await p.click('#start');await p.waitForSelector('.board-svg .tile');
  const seen=new Set();let steps=0,finished=false;
  for(;steps<400;steps++){
    if(steps===60)await p.screenshot({path:`${OUT}/${name}-midgame.png`});
    const phase=await p.evaluate(()=>JSON.parse(localStorage.getItem('ie-save-v1')||'{}').phase);
    if(phase)seen.add(phase);
    if(phase==='FINISHED'){finished=true;break}
    const click=async sel=>{const el=p.locator(sel).first();if(await el.count()){await el.click({timeout:4000});return true}return false};
    if(await click('[data-cmd="ROLL"]'))continue;
    if(await click('[data-cmd="CONFIRM_ROLL"]'))continue;
    if(await p.locator('.tile.choice').count()){await p.locator('.tile.choice').first().dispatchEvent('click');await p.waitForTimeout(80);continue}
    if(await click('[data-path]'))continue;
    if(await click('[data-cmd="CONFIRM_READY"]'))continue;
    if(await click('[data-outcome="success"]:not([disabled])'))continue;
    if(await click('[data-outcome="failure"]'))continue;
    if(await click('[data-tie]'))continue;
    if(await click('[data-cmd="END_TURN"]'))continue;
    await p.waitForTimeout(120);

  }
  await p.screenshot({path:`${OUT}/${name}-end.png`});
  const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight}));
  const ok=finished&&!errs.length&&ov.sw<=ov.cw;
  console.log(ok?'OK  ':'FAIL',name.padEnd(16),`kroki=${steps}`,`zakończona=${finished}`,`fazy=${[...seen].join('>')}`,`przewijanie-poziome=${ov.sw>ov.cw}`,errs.slice(0,3));
  if(!ok)failed++;await ctx.close();
}
await b.close();process.exit(failed?1:0);
