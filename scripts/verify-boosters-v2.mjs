import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {transform} from 'esbuild';

let html=await fs.readFile('dist/index.html','utf8');
// The same test works during module development and after the feature build.
if(!html.includes("const kzRevealPreferenceKey="))html=html.replace('/* KIZUNA_GAME_BRIDGE_BEGIN */',(await fs.readFile('src/booster-views.inc.js','utf8'))+'\n/* KIZUNA_GAME_BRIDGE_BEGIN */');
const errors=[],requests=[],vc=new VirtualConsole();
vc.on('error',(...args)=>errors.push(args.join(' ')));
vc.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.message);});
const dom=new JSDOM(html,{url:'https://kizuna.example.test/#boosters',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;w.scrollTo=()=>{};w.AbortSignal=AbortSignal;
w.fetch=async url=>{requests.push(String(url));throw Error('Unexpected request');};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
let reduced=false;w.matchMedia=()=>({matches:reduced,addEventListener(){},removeEventListener(){}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw Error('Timed out waiting for reveal');await delay(10);}};
const root=()=>w.document.getElementById('kyaraRevealRoot');
const button=action=>root().querySelector('[data-kr-action="'+action+'"]');
const phase=()=>root().dataset.phase;
try{
  for(const script of w.document.scripts){
    const src=script.getAttribute('src');let code=src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent;
    if(!src&&code.includes('window.KizunaGame={'))code=code.replace('window.KizunaGame={','window.__boosterViewsQA={getState:()=>state,renderReveal,closeBackdrop};window.KizunaGame={');
    new vm.Script(code,{filename:src||'inline.js'});w.eval(code);
    if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};
  }
  await delay(40);
  assert.deepEqual(errors,[]);const game=w.KizunaGame;
  w.Math.random=()=>.999999;
  const fixture=(n=15,pity=0)=>({owned:[],pulls:[],username:'Révélation',chakra:4321,stock:{free:n,inv:7,pm:pity,pl:pity===249?49:0,t:Date.now(),day:''}});
  const preview=n=>{game.showTab('boosts');w.document.getElementById(n===10?'kOpen10':n===5?'kOpen5':'kOpen1').click();assert.equal(phase(),'pack');};
  const setQuick=value=>{const button=root().querySelector('[data-kz-reveal-setting="quick"]');if((button.getAttribute('aria-pressed')==='true')!==value)button.click();};
  const plain=value=>JSON.parse(JSON.stringify(value));
  // A full reserve advances its recharge timestamp during a UI refresh.
  // Compare every game field except this clock; balances must stay identical.
  const economicState=value=>{const copy=plain(value);delete copy.stock.t;return copy;};

  game.applySnapshot(fixture());const baseline=economicState(game.getSnapshot());preview(5);
  assert.deepEqual(economicState(game.getSnapshot()),baseline,'Preview must not debit or draw');
  assert.equal(w.document.activeElement,button('open-pack'));
  assert.equal(root().querySelector('[data-kz-reveal-setting="sound"]').getAttribute('aria-pressed'),'false');
  assert.ok(root().querySelector('.ksm-sigil svg'),'The preview has the original invocation seal');assert.equal(root().querySelector('.ksm-prestige-ring'),null,'No exceptional rarity is implied before a draw');
  button('open-pack').click();button('open-pack').click();button('close').click();
  await delay(1450);assert.deepEqual(economicState(game.getSnapshot()),baseline,'Closing during invocation cancels before draw');
  assert.ok(!w.document.getElementById('revealBackdrop').classList.contains('open'));

  game.applySnapshot(fixture());preview(1);button('open-pack').click();
  assert.equal(root().dataset.summon,'charging');assert.equal(game.getSnapshot().owned.length,0,'Charging does not grant cards');
  const skipIntro=root().querySelector('[data-ksm-skip]');assert.equal(skipIntro.hidden,false);assert.equal(skipIntro.disabled,false);skipIntro.click();skipIntro.click();
  await until(()=>phase()==='opening');assert.equal(game.getSnapshot().owned.length,5,'Skipping the invocation draws exactly once');assert.equal(root().dataset.summon,'revealed');button('close').click();

  // Ordinary path retains real engine order and saves before first card animation.
  game.applySnapshot(fixture());preview(1);setQuick(false);button('open-pack').click();button('open-pack').click();
  await until(()=>phase()==='opening');
  assert.equal(game.getSnapshot().owned.length,5,'A double click draws exactly once');
  assert.equal(JSON.parse(w.localStorage.getItem('hoshi_owned_cards_v2')).length,5,'Owned cards saved before reveal');
  assert.equal(game.getSnapshot().stock.free,14);assert.equal(game.getSnapshot().stock.inv,7);assert.equal(game.getSnapshot().chakra,4321);
  const sequence=[];
  for(let i=0;i<5;i++){
    await until(()=>Number(root().querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'))===i+1);
    sequence.push(root().querySelector('.kr-current-card .tcard').dataset.r);
    assert.equal(root().querySelector('.kz-mythic-seal'),null,'No Mythic effects for lower rarities');
    assert.equal(root().querySelector('.ksm-prestige-ring'),null,'Ordinary cards have no prestige burst');assert.ok(root().querySelector('.ksm-sigil'));assert.equal(root().querySelector('.kg-card-back'),null,'Cards materialise instead of using the old flip');
    if(i<4)button('advance').click();
  }
  assert.deepEqual(sequence,['C','C','C','U','R']);button('advance').click();assert.equal(phase(),'finale');
  assert.equal(root().querySelectorAll('.kr-finale-card').length,5);
  assert.equal(w.document.activeElement.id,'kzRevealTitle');
  const tab=new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});w.document.activeElement.dispatchEvent(tab);
  assert.equal(w.document.activeElement,button('close'),'Summary focus enters the modal controls');
  button('close').click();

  // Skip/all invalidates a queued transition instead of reopening an earlier card.
  game.applySnapshot(fixture(15,249));preview(1);button('open-pack').click();await until(()=>phase()==='opening');
  button('advance').click();button('skip').click();await delay(180);
  assert.equal(Number(root().querySelector('[role="progressbar"]').getAttribute('aria-valuenow')),5);
  assert.equal(root().dataset.rarity,'M');assert.ok(root().querySelector('.kz-mythic-seal'));
  assert.ok(root().querySelector('.ksm-prestige-ring'),'A real Mythic gets the enhanced invocation');
  assert.equal(game.getSnapshot().stock.pm,0);assert.equal(game.getSnapshot().stock.pl,0);
  w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  assert.equal(root().dataset.rarity,'U');button('advance').click();button('all').click();await delay(180);
  assert.equal(phase(),'finale','In-flight next cannot replace the requested recap');
  assert.equal(game.getSnapshot().owned.length,5);button('close').click();

  // Quick is a presentation preference only. Quantities and guarantees use the engine.
  for(const n of [5,10]){
    game.applySnapshot(fixture());preview(n);setQuick(true);const initial=plain(game.getSnapshot());
    button('open-pack').click();await until(()=>phase()==='finale');
    const after=game.getSnapshot();assert.equal(after.owned.length,n*5);assert.equal(after.stock.free,initial.stock.free-n);assert.equal(after.stock.inv,initial.stock.inv);assert.equal(after.chakra,initial.chakra);
    const recap=[...root().querySelectorAll('.kr-finale-card .tcard')].map(node=>node.dataset.r),levels={C:1,U:2,R:3,E:4,L:5,M:6};
    assert.equal(recap.length,n*5);assert.deepEqual(recap.map(x=>levels[x]),recap.map(x=>levels[x]).sort((a,b)=>a-b));
    assert.equal(JSON.parse(w.localStorage.getItem('kizuna_reveal_preferences_v1')).quick,true);
    button('close').click();
  }

  // Reduce motion keeps sequential cards while omitting intentional animation delays.
  game.applySnapshot(fixture());preview(1);setQuick(false);reduced=true;
  button('open-pack').click();await until(()=>phase()==='opening');assert.equal(game.getSnapshot().owned.length,5);
  button('advance').click();button('close').click();await delay(180);
  assert.ok(!w.document.getElementById('revealBackdrop').classList.contains('open'),'A delayed transition cannot reopen a closed modal');
  assert.equal(game.getSnapshot().owned.length,5);

  // Switching player mid-invocation must never debit or populate the new identity.
  reduced=false;game.applySnapshot(fixture());preview(1);button('open-pack').click();
  game.applySnapshot({...fixture(),username:'Autre joueur',chakra:7654});await delay(1450);
  assert.equal(game.getSnapshot().username,'Autre joueur');assert.equal(game.getSnapshot().owned.length,0);assert.equal(game.getSnapshot().chakra,7654);
  assert.equal(game.getSnapshot().stock.free,15);
  assert.deepEqual(errors,[]);assert.equal(requests.length,0);
  const css=await transform(await fs.readFile('dist/kizuna-boosters-v2.css','utf8'),{loader:'css'});assert.deepEqual(css.warnings,[]);
  const invocationCSS=await transform(await fs.readFile('dist/kizuna-summoning.css','utf8'),{loader:'css'});assert.deepEqual(invocationCSS.warnings,[]);
  console.log(JSON.stringify({preview:'no spend',invocation:'seal, energy, actual rarity, skip intro exactly once',cancel:'no draw',doubleClick:'exactly once',sequence,save:'before reveal',mythic:'actual guarantee only',quickBatches:[25,50],raceSafety:'skip/all/close/account switch',reducedMotion:'sequential no delays',keyboard:'focus and trap',economy:'unchanged',css:'valid',errors:0}));
}finally{w.close();}
