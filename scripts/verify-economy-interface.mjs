import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {JSDOM,VirtualConsole} from 'jsdom';
const errors=[],v=new VirtualConsole();v.on('error',e=>errors.push(String(e)));v.on('jsdomError',e=>{if(!/Could not parse CSS/.test(e.message))errors.push(e.message);});
const html=await fs.readFile('dist/index.html','utf8'),dom=new JSDOM(html,{url:'https://kizuna.example.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:v}),w=dom.window,d=w.document;
w.scrollTo=()=>{};w.confirm=()=>true;w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});w.CSS={escape:s=>String(s).replace(/[^\w-]/g,'')};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.fetch=async()=>{throw Error('No network expected');};
const pause=()=>new Promise(r=>setTimeout(r,50)),plain=x=>JSON.parse(JSON.stringify(x)),click=sel=>{const el=d.querySelector(sel);assert.ok(el,sel);el.click();return el;};
try{
 for(const script of d.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
 await pause();const game=w.KizunaGame,at=1700000000000;
 game.applySnapshot({username:'A',chakra:500,owned:[{id:'cseed-0013',at},{id:'cseed-0014',at}],pulls:[],stock:{free:3,inv:2,pm:0,pl:0,t:Date.now(),day:''},market:{listings:[],history:[],wishlist:[],cards:[],credits:{}}});
 let account={economy:true,user:{id:'A'},profile:{username:'A'},status:'synced',loading:false,revision:1,serverClock:{at:Date.now(),received:w.performance.now()}},block=null,deny=false;
 const requests=[],listing={id:'test-listing',cardId:'cseed-0015',sellerId:'B',seller:'<img onerror=alert(1)>',mode:'sale',price:100,status:'active',createdAt:Date.now(),endsAt:Date.now()+3600000,wantCardIds:[]};
 w.KIZUNA_CONFIG={serverEconomy:true};w.KizunaAccount.getSnapshot=()=>plain(account);
 w.KizunaAccount.nexusRequest=async()=>({nodes:[],unlocked:['collection_1'],configVersion:1,stateRevision:1,xp:0,level:1,nextLevelXp:100,bonuses:{recycleBps:500},recycleRemainder:7500,preferences:{priorityCardIds:[]},daily:{},serverNow:Date.now()});
 w.KizunaAccount.economyRequest=async(action,payload={})=>{
  requests.push({action,payload:plain(payload)});if(block)await block;if(deny)throw Error('Simulation réseau');
  let result={};if(action==='browse')result.listings=Array.from({length:25},(_,i)=>({...listing,id:i?'other-'+i:listing.id}));
  if(action==='history')result.sales=[];
  if(action==='open'){const s=game.getSnapshot();s.stock.free--;const cards=[{id:'cseed-0013',at:Date.now(),level:6,rarity:'Mythique'},{id:game.getSnapshot().cards.find(c=>c.rarity==='Commun').id,at:Date.now(),level:1,rarity:'Commun'}];s.owned.push(...cards);game.applySnapshot(s,{preserveViews:true});result.cards=cards;}
  return {snapshot:game.getSnapshot(),revision:++account.revision,serverNow:Date.now(),result};
 };
 d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));game.showTab('market');await pause();
 assert.equal(d.querySelector('#keExchange').hidden,false);assert.equal(d.querySelector('#marketPage>.wrap').hidden,true);
 assert.equal(d.querySelectorAll('.ke-listing').length,24);assert.match(d.querySelector('.ke-copy').textContent,/<img onerror/);assert.equal(d.querySelector('.ke-copy img'),null);
 click('[data-ke-page="1"]');await pause();assert.equal(requests.at(-1).payload.page,1);
 click('[data-ke-history]');await pause();assert.match(d.querySelector('#keExchangeDialog').textContent,/Aucune vente conclue/);assert.equal(d.querySelector('#keExchangeDialog').open,true);click('#keExchangeDialog [data-ke-close]');
 const before=JSON.stringify(game.getSnapshot());deny=true;click('[data-ke-action="buy"]');await pause();assert.match(d.querySelector('.ke-status').textContent,/réseau/);assert.equal(JSON.stringify(game.getSnapshot()),before,'Failed purchase never debits local balance');deny=false;
 game.showTab('collection');w.KizunaExchange.openSell('cseed-0013');let form=d.querySelector('#keSell');assert.ok(form);assert.match(d.querySelector('#keExchangeDialog').getAttribute('aria-label'),/Proposer/);const sellDialog=d.querySelector('#keExchangeDialog');sellDialog.getBoundingClientRect=()=>({left:10,right:600,top:10,bottom:600});sellDialog.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:20,clientY:20}));assert.ok(sellDialog.open,'Clicking dialog padding retains the draft');form.elements.mode.value='trade';form.elements.mode.dispatchEvent(new w.Event('change'));const wanted=d.querySelector('#keWanted input');wanted.checked=true;wanted.dispatchEvent(new w.Event('change',{bubbles:true}));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();assert.equal(requests.at(-1).action,'publish');assert.equal(requests.at(-1).payload.wants.length,1);assert.equal(requests.at(-1).payload.cardId,'cseed-0013');assert.equal(JSON.stringify(game.getSnapshot()),before,'Publication does not mutate inventory optimistically');
 game.showTab('boosters');click('#kTabs [data-t="daily"]');click('[data-act="daily"]');await pause();assert.equal(requests.at(-1).action,'daily');
 const common=game.getSnapshot().cards.find(c=>c.rarity==='Commun'),recycleState=game.getSnapshot();
 recycleState.owned=[{id:common.id,at},{id:common.id,at}];game.applySnapshot(recycleState,{preserveViews:true});
 let quote='';w.confirm=text=>{quote=text;return true;};game.showTab('collection');await pause();
 click('#colRecycle');await pause();assert.equal(requests.at(-1).action,'recycle_all');assert.match(quote,/pour 6 Chakra/);assert.match(quote,/bonus Nexus : \+1/);
 assert.equal(requests.at(-1).payload.revision,account.revision-1,'Quote uses the current economic revision');
 assert.equal('chakra' in requests.at(-1).payload,false,'A recycle intention never sends a client-computed reward');
 game.showTab('boosters');
 game.openBoosterSelection('mix',1);click('[data-kr-action="open-pack"]');await new Promise(r=>setTimeout(r,350));assert.equal(requests.at(-1).action,'open');assert.equal(requests.at(-1).payload.count,1);assert.equal(game.getSnapshot().stock.free,2);assert.match(d.querySelector('.kr-card-caption').textContent,/Commun/,'Server results retain ascending reveal order');
 click('[data-kr-action="close"]');await pause();
 account={user:null,economy:false,loading:false};d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));assert.equal(d.querySelector('#keExchange').hidden,true);assert.equal(d.querySelector('#keExchange').innerHTML,'','Private market view cleared at sign-out');
}finally{dom.window.close();}
assert.deepEqual(errors,[]);console.log(JSON.stringify({sharedMarketPagination:true,escapedSeller:true,honestSalesHistory:true,noOptimisticDebit:true,tradePublication:true,errors}));
