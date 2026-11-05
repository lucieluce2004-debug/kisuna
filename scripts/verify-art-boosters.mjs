import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {transform} from 'esbuild';

let html=await fs.readFile('dist/index.html','utf8');
// --source supports parallel development without writing the shared index.html.
if(process.argv.includes('--source')){
 const sources=await Promise.all(['booster-views.inc.js','wiki-view.inc.js','card-viewer.inc.js','market-presentation.inc.js','economy-bridge.inc.js'].map(name=>fs.readFile('src/'+name,'utf8')));
 html=html.replace(/\/\* KIZUNA_FEATURE_VIEWS_BEGIN \*\/[\s\S]*?\/\* KIZUNA_FEATURE_VIEWS_END \*\//,'/* KIZUNA_FEATURE_VIEWS_BEGIN */\n'+sources.join('\n\n')+'\n/* KIZUNA_FEATURE_VIEWS_END */');
}
const errors=[],requests=[],events=[],vc=new VirtualConsole();
vc.on('error',(...args)=>errors.push(args.join(' ')));
vc.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.message);});
const dom=new JSDOM(html,{url:'https://kizuna.example.test/#boosters',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
w.scrollTo=()=>{};w.AbortSignal=AbortSignal;
w.fetch=async url=>{requests.push(String(url));throw Error('Unexpected network');};
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async predicate=>{const end=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<end,'Opening did not settle');await wait(10);}};
const root=()=>d.getElementById('kyaraRevealRoot'),button=action=>root().querySelector('[data-kr-action="'+action+'"]');
const plain=value=>JSON.parse(JSON.stringify(value));
const balances=s=>JSON.stringify({owned:s.owned,chakra:s.chakra,pulls:s.pulls,free:s.stock.free,inv:s.stock.inv,pm:s.stock.pm,pl:s.stock.pl});
try{
 for(const script of d.scripts){
  const src=script.getAttribute('src');let code=src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent;
  if(!src&&code.includes('window.KizunaGame={'))code=code.replace('window.KizunaGame={','window.__artBoosterQA={getState:()=>state,renderReveal,karAnnounceResult,cards:()=>LOCAL_CARDS};window.KizunaGame={');
  w.eval(code);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};
 }
 await wait(50);assert.deepEqual(errors,[]);assert.ok(w.__artBoosterQA,'Artistic source is built');
 const artCSS=await fs.readFile('dist/kizuna-art-boosters.css','utf8'),style=d.createElement('style');style.textContent=artCSS;d.head.append(style);d.body.classList.add('kz-art');
 w.addEventListener('kizuna:opening-result',event=>events.push({detail:plain(event.detail),saved:w.KizunaGame.getSnapshot().owned.length}));
 const game=w.KizunaGame,qa=w.__artBoosterQA;
 const fixture=(pm=0,pl=0)=>({owned:[],pulls:[],username:'Art QA',chakra:4321,stock:{free:25,inv:9,pm,pl,t:Date.now(),day:''}});
 w.Math.random=()=>.999999;
 const preview=n=>{game.showTab('boosts');d.getElementById(n===10?'kOpen10':n===5?'kOpen5':'kOpen1').click();assert.equal(root().dataset.phase,'pack');};
 const open=async()=>{button('open-pack').click();await until(()=>root().dataset.phase==='opening'||root().dataset.phase==='finale');};
 game.applySnapshot(fixture());const before=balances(game.getSnapshot());preview(1);
 assert.ok(root().querySelector('.kr-pack-art .kg-pack-image'),'The actual selected booster is illustrated');
 assert.ok(root().querySelector('.kar-pack-tear'),'The packet includes a detachable crimped strip');
 assert.equal(root().querySelector('.kar-rarity-event'),null,'Preview never announces a fake high rarity');
 assert.equal(balances(game.getSnapshot()),before);assert.equal(events.length,0);button('close').click();
 assert.equal(events.length,0,'Cancelling a preview produces no favorite celebration');

 preview(1);await open();assert.equal(events.length,1);
 const first=events[0];assert.equal(first.saved,5,'Celebration only runs after saved results');
 assert.equal(first.detail.owner,'guest');assert.equal(first.detail.count,5);assert.equal(first.detail.mythicCount,0);assert.equal(first.detail.cardIds.length,5);assert.ok(first.detail.receiptKey);
 const ascending=[];
 for(let i=0;i<5;i++){
  assert.ok(root().querySelector('.kar-card-back'),'Each sequential card has a real reverse side');
  assert.equal(w.getComputedStyle(root().querySelector('.kr-current-card>.tcard')).display,'flex','Portrait region must retain the card flex layout');
  assert.equal(root().querySelector('.kar-rarity-event'),null,'Common through Rare never use exceptional entrances');
  ascending.push(root().dataset.rarity);button('advance').click();
  await until(()=>i===4?root().dataset.phase==='finale':qa.getState().revealIndex===i+1);
 }
 assert.deepEqual(ascending,['C','C','C','U','R']);assert.equal(events.length,1,'Flipping and recap do not replay acquisition');
 assert.equal(root().querySelectorAll('.kr-finale-card').length,5);assert.equal(game.getSnapshot().stock.free,24);assert.equal(game.getSnapshot().chakra,4321);
 const owned=balances(game.getSnapshot());button('again').click();await until(()=>root().dataset.phase==='pack');assert.equal(balances(game.getSnapshot()),owned,'Another invocation first opens a non-spending preview');button('close').click();

 for(const [pm,pl,letter,selector] of [[0,49,'L','.kar-legendary-event'],[249,49,'M','.kar-mythic-event']]){
  game.applySnapshot(fixture(pm,pl));preview(1);await open();button('skip').click();
  assert.equal(root().dataset.rarity,letter);assert.ok(root().querySelector(selector));
  assert.equal(root().querySelector(letter==='M'?'.kar-legendary-event':'.kar-mythic-event'),null,'Legendary and Mythic have distinct scenes');
  assert.equal(events.at(-1).detail.mythicCount,letter==='M'?1:0);button('all').click();
  assert.equal(root().querySelectorAll('.kr-finale-card').length,5);button('close').click();
 }
 game.applySnapshot(fixture());preview(10);root().querySelector('[data-kz-reveal-setting="quick"]').click();await open();
 assert.equal(root().dataset.phase,'finale');assert.equal(root().querySelectorAll('.kr-finale-card').length,50);assert.equal(events.at(-1).detail.count,50);assert.equal(game.getSnapshot().stock.free,15);button('close').click();

 // Only account-scoped real-opening reactions are allowed; repeated server revisions
 // can never produce a second celebration, and event handling cannot change balances.
 const cards=qa.cards().slice(0,5),originalAccount=w.KizunaAccount;
 const beforeAnnouncements=balances(game.getSnapshot()),eventCount=events.length;
 qa.karAnnounceResult(cards);assert.equal(events.length,eventCount,'A catalogue/preview is not an acquisition');
 w.KizunaAccount={...originalAccount,getSnapshot:()=>({user:{id:'art-test-owner'},economy:true,revision:33})};
 qa.getState().opening=true;qa.karAnnounceResult(cards);qa.karAnnounceResult(cards.slice());qa.karAnnounceResult(cards);
 assert.equal(events.length,eventCount+1);assert.equal(events.at(-1).detail.owner,'art-test-owner');assert.equal(events.at(-1).detail.receiptKey,'art-test-owner:revision:33');
 qa.getState().opening=false;w.KizunaAccount=originalAccount;
 assert.equal(balances(game.getSnapshot()),beforeAnnouncements,'The reaction hook is read-only');
 const css=await transform(artCSS,{loader:'css'});assert.deepEqual(css.warnings,[]);
 assert.deepEqual(errors,[]);assert.equal(requests.length,0);
 console.log(JSON.stringify({art:'illustrated packet, removable strip, genuine reverse/front',ordinaryOrder:ascending,rareEntrances:['Legendary gold blades','Mythic split gate'],recap:[5,50],reactions:'post-save, owner scoped, revision deduplicated, read-only',preview:'no debit and no celebration',css:'valid',errors:0}));
}finally{w.close();}
