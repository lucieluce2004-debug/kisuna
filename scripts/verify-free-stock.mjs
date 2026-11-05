import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';

// Exercise the actual game and browser storage. No network request, cloud
// account, administrative reward or database mutation is created here.
const html=await fs.readFile('dist/index.html','utf8');
const rechargeMs=6*3600*1000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw new Error('Free stock UI did not settle');await pause(15);}}
async function boot(stock){
  const errors=[],requests=[],consoleBridge=new VirtualConsole();
  consoleBridge.on('error',(...values)=>errors.push(values.map(String).join(' ')));
  consoleBridge.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.message);});
  const dom=new JSDOM(html,{url:'https://kizuna.example.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:consoleBridge});
  const w=dom.window;w.scrollTo=()=>{};w.AbortSignal=AbortSignal;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.fetch=async value=>{requests.push(String(value));throw new Error('Unexpected network request');};
  if(stock!==undefined)w.localStorage.setItem('hoshi_stock_v2',typeof stock==='string'?stock:JSON.stringify(stock));
  for(const script of w.document.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await pause(30);
  return {dom,w,game:w.KizunaGame,errors,requests,close(){assert.equal(requests.length,0);assert.deepEqual(errors,[]);dom.window.close();}};
}

const fresh=await boot();
try{assert.equal(fresh.game.freePackLimit,10);assert.equal(fresh.game.getSnapshot().stock.free,3,'A fresh player still starts with three free packs');assert.match(fresh.w.document.querySelector('#kFoot').textContent,/3\/10 gratuits/);}finally{fresh.close();}

let savedStock;
const stored=await boot({free:25,t:Date.now(),inv:250,pm:12,pl:7,day:'unchanged'});
try{
  let state=stored.game.getSnapshot();assert.equal(state.stock.free,25);assert.equal(state.stock.inv,250);assert.equal(stored.w.document.querySelector('#kStock').textContent,'275');
  stored.game.applySnapshot({...state,stock:{...state.stock,free:100}});assert.equal(stored.game.getSnapshot().stock.free,100);
  stored.game.applySnapshot({...state,stock:{...state.stock,free:104}});assert.equal(stored.game.getSnapshot().stock.free,103,'Retained stock is bounded by the historical maximum');
  stored.game.applySnapshot({...state,stock:{inv:250,t:Date.now()}});assert.equal(stored.game.getSnapshot().stock.free,3,'Snapshot defaults retain the original starting balance');
  stored.game.applySnapshot(state);savedStock=stored.w.localStorage.getItem('hoshi_stock_v2');assert.equal(JSON.parse(savedStock).free,25);assert.equal(stored.game.getSnapshot().stock.pm,12);assert.equal(stored.game.getSnapshot().stock.pl,7);
}finally{stored.close();}
const reloaded=await boot(savedStock);
try{assert.equal(reloaded.game.getSnapshot().stock.free,25);assert.equal(reloaded.game.getSnapshot().stock.inv,250);assert.equal(reloaded.game.getSnapshot().stock.pm,12);assert.equal(reloaded.game.getSnapshot().stock.pl,7);}finally{reloaded.close();}

const replenished=await boot({free:3,t:Date.now()-9*rechargeMs-2000,inv:2,pm:0,pl:0});
try{assert.equal(replenished.game.getSnapshot().stock.free,10,'Recharge stops at the new base capacity');assert.equal(replenished.game.getSnapshot().stock.inv,2);}finally{replenished.close();}
const capped=await boot({free:99,t:Date.now()-3*rechargeMs-2000,inv:25,pm:0,pl:0});
try{assert.equal(capped.game.getSnapshot().stock.free,99,'Legacy surplus is retained without further recharge');assert.equal(capped.game.getSnapshot().stock.inv,25,'Free capacity does not clamp separately gifted packs');}finally{capped.close();}

const opening=await boot({free:25,t:Date.now(),inv:20,pm:0,pl:0});
try{
  opening.w.Math.random=()=>.999999;
  for(const [batch,free,inv]of [[1,15,20],[2,5,20],[3,0,15]]){
    opening.w.document.querySelector('#kOpen10').click();
    const choices=[...opening.w.document.querySelectorAll('[data-kr-action="quantity"]')].map(button=>Number(button.dataset.count));assert.deepEqual(choices,[1,5,10],'The user requested more stock, so batch choices stay unchanged');
    opening.w.document.querySelector('[data-kr-action="open-pack"]').click();
    await until(()=>opening.game.getSnapshot().owned.length===batch*50);
    const snapshot=opening.game.getSnapshot();assert.equal(snapshot.stock.free,free,'Recharge stock is consumed first');assert.equal(snapshot.stock.inv,inv,'Bonus stock is only used after free stock');assert.equal(snapshot.stock.pm,batch*10);assert.equal(snapshot.stock.pl,batch*10,'Opening batches keeps advancing the existing pity counters');
    assert.equal(opening.w.document.querySelector('#kyaraRevealRoot [role="progressbar"]').getAttribute('aria-valuemax'),'50','Ten boosters still expose all fifty drawn cards');
    opening.w.document.querySelector('#kyaraRevealRoot [data-kr-action="close"]').click();
  }
  const snapshot=opening.game.getSnapshot();opening.game.applySnapshot({...snapshot,stock:{...snapshot.stock,free:0,inv:9,t:Date.now()}});assert.equal(opening.w.document.querySelector('#kOpen10').disabled,true);assert.equal(opening.w.document.querySelector('#kOpen5').disabled,false);
}finally{opening.close();}
console.log(JSON.stringify({freeCapacity:10,startingFreePacks:3,footer:'3/10 gratuits',stockAboveTen:'25 retained in local storage and reload',cloudSnapshotNormalization:'25 and 100 accepted; historical max103',recharge:'3 to 10; surplus99 retained',bonusStock:'250 retained independently',openingChoices:'1 / 5 / 10 unchanged',consumeFreeBeforeBonus:'passed',drawsAndPities:'50 cards per batch; counters preserved',insufficientStock:'buttons remain bounded',network:'none'}));
