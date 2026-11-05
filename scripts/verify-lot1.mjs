import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';

// Isolated browser fixtures only: no external request, real account or DB write.
const html=await fs.readFile('dist/index.html','utf8');
const backupCode=await fs.readFile('dist/kizuna-preserve.js','utf8');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const plain=value=>JSON.parse(JSON.stringify(value));
function fakeIndexedDB(records=new Map(),fail=false){
  return {records,open(){const request={};queueMicrotask(()=>{
    const db={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},transaction(){
      const tx={};tx.objectStore=()=>({get(id){const read={};queueMicrotask(()=>{read.result=records.get(id);read.onsuccess?.();setTimeout(()=>fail?tx.onabort?.():tx.oncomplete?.(),0);});return read;},add(value){if(!fail)records.set(value.id,structuredClone(value));}});return tx;
    }};request.result=db;request.onupgradeneeded?.();request.onsuccess?.();
  });return request;}};
}
async function backupHarness(values,{records,fail=false,noIdb=false,blockedStorage=false}={}){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://kizuna.example.test/',runScripts:'outside-only'}),w=dom.window;
  const db=fakeIndexedDB(records,fail);if(!noIdb)Object.defineProperty(w,'indexedDB',{value:db});
  for(const [key,value] of Object.entries(values))w.localStorage.setItem(key,value);
  if(blockedStorage)Object.defineProperty(w,'localStorage',{get(){throw new Error('Storage blocked');}});
  w.eval(backupCode);return {dom,w,db};
}
const rawCards=JSON.stringify(Array.from({length:5003},(_,i)=>({id:'retained-'+i,at:i,extra:'raw field retained'})));
const rawHistory=JSON.stringify(Array.from({length:83},(_,i)=>({id:'tx-'+i,at:i,unknown:'never normalize a backup'})));
const playerId='12345678-1234-4234-8234-123456789abc';
const values={hoshi_owned_cards_v2:rawCards,hoshi_stock_v2:'{raw malformed stock retained',hoshi_chakra_v2:' 809 ',kyara_market_history_v1:rawHistory,kizuna_workspace_owner_v1:JSON.stringify(playerId),['kizuna_unsynced_v1_'+playerId]:'{"privateProgress":true}',kizuna_auth_v1:'DO_NOT_COPY_AUTH',supabase_auth_token:'DO_NOT_COPY_TOKEN',unrelated:'DO_NOT_COPY_OTHER',kizuna_unsynced_v1_not_a_uuid:'DO_NOT_COPY_MALFORMED_PREFIX'};
const saved=await backupHarness(values);
try{
  saved.w.localStorage.setItem('hoshi_owned_cards_v2','[]');
  assert.equal(await saved.w.KizunaPreservation.ready,'saved');
  assert.equal(saved.db.records.size,1);const record=[...saved.db.records.values()][0];
  assert.equal(record.values.hoshi_owned_cards_v2,rawCards,'Synchronous capture retains all 5003 raw copies before any legacy normalization');
  assert.equal(record.values.kyara_market_history_v1,rawHistory,'All 83 raw transactions survive backup without the legacy 80-row cap');
  assert.equal(record.values.hoshi_stock_v2,values.hoshi_stock_v2,'Malformed original content is preserved verbatim for recovery');
  assert.equal(record.values.hoshi_chakra_v2,' 809 ');
  for(const key of ['kizuna_auth_v1','supabase_auth_token','unrelated','kizuna_unsynced_v1_not_a_uuid'])assert.equal(Object.hasOwn(record.values,key),false,'Strict backup allowlist excludes '+key);
  assert.equal(record.values['kizuna_unsynced_v1_'+playerId],values['kizuna_unsynced_v1_'+playerId]);
  assert.equal(saved.w.localStorage.getItem('hoshi_owned_cards_v2'),'[]','Backup never restores over the live game automatically');
  for(const [key,value] of Object.entries(values))if(key!=='hoshi_owned_cards_v2')assert.equal(saved.w.localStorage.getItem(key),value,'Backup leaves original '+key+' untouched');
  const repeat=await backupHarness({...values,hoshi_chakra_v2:'0'},{records:saved.db.records});
  try{assert.equal(await repeat.w.KizunaPreservation.ready,'saved');assert.equal(repeat.db.records.size,1);assert.equal([...repeat.db.records.values()][0].values.hoshi_chakra_v2,' 809 ','An existing pre-redesign backup is not overwritten on reload');}finally{repeat.dom.window.close();}
}finally{saved.dom.window.close();}
for(const options of [{noIdb:true},{fail:true},{blockedStorage:true}]){
  const h=await backupHarness(values,options);try{assert.equal(await h.w.KizunaPreservation.ready,'unavailable');if(!options.blockedStorage)for(const [key,value]of Object.entries(values))assert.equal(h.w.localStorage.getItem(key),value,'Storage failure cannot destroy '+key);}finally{h.dom.window.close();}
}
const empty=await backupHarness({});try{assert.equal(await empty.w.KizunaPreservation.ready,'empty');assert.equal(empty.db.records.size,0);}finally{empty.dom.window.close();}

const errors=[],requests=[],consoleBridge=new VirtualConsole();
consoleBridge.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.message);});
consoleBridge.on('error',(...args)=>errors.push(args.map(String).join(' ')));
const dom=new JSDOM(html,{url:'https://kizuna.example.test/?auth=discord#boosters',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:consoleBridge}),w=dom.window;
w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
w.fetch=async value=>{requests.push(String(value));throw new Error('Unexpected external request');};
const settle=async()=>{await pause(50);};
const control=(id,value)=>{const node=w.document.getElementById(id);node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));};
const economic=()=>{const s=w.KizunaGame.getSnapshot();return plain(Object.fromEntries(['owned','pulls','catalogue','market','chakra','stock','username'].map(key=>[key,s[key]])));};
try{
  for(const script of w.document.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await settle();assert.equal(w.document.body.dataset.tab,'boosts','A direct #boosters URL opens the booster section');assert.equal(w.location.search,'?auth=discord','Presentation routing preserves OAuth callback parameters');
  const game=w.KizunaGame,cards=Array.from(game.getSnapshot().cards),first=cards[0],other=cards.find(c=>c.series!==first.series),myth=cards.find(c=>c.rarity==='Mythique');
  const at=Date.now()-1000,copy={id:first.id,at,rarity:first.rarity,level:6};
  game.applySnapshot({username:'Lot1Fixture',owned:[copy,{...copy,at:at+1},{id:myth.id,at:at+2}],pulls:[{id:myth.id,name:myth.name,series:myth.series,rarity:'Mythique',level:6,at,pullId:'real-fixture-pull',username:'Lot1Fixture'}],chakra:937,stock:{free:37,t:Date.now(),inv:23,pm:128,pl:32,day:'retained-day'},market:{listings:[{id:'retained-sale',cardId:other.id,seller:'Lot1Fixture',mode:'sale',status:'active',price:500,createdAt:at,reservedCopy:{id:other.id,at:at-1}}],credits:{AnotherPlayer:50},cards:[{username:'AnotherPlayer',card:{id:other.id,at},at}],history:[{id:'retained-history',type:'buy',cardId:first.id,at,gross:100,fee:5,net:95}],wishlist:[other.id]}});
  let account={user:{id:playerId},profile:{id:playerId,username:'Lot1Fixture'},loading:false,status:'synced',error:''};w.KizunaAccount.getSnapshot=()=>({...account});w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await settle();
  const before=economic(),storageBefore=Object.fromEntries([...Object.keys(w.localStorage)].filter(key=>/^(hoshi_|kyara_market_)/.test(key)).map(key=>[key,w.localStorage.getItem(key)]));
  const destinations=[['boosts','boosters'],['col','collection'],['universes','universes'],['community','community'],['market','marketPage'],['home','home']];
  for(const [tab,fragment]of destinations){const link=w.document.querySelector('.kz-shell-nav [data-tab="'+tab+'"]');assert.ok(link,'Header destination '+tab);link.click();await settle();assert.equal(w.document.body.dataset.tab,tab);assert.equal(w.location.hash,'#'+fragment);assert.equal(link.getAttribute('aria-current'),'page');assert.ok(link.classList.contains('active'));assert.equal(w.document.querySelectorAll('.kz-shell-nav [aria-current="page"]').length,1);assert.deepEqual(economic(),before,'Navigation to '+tab+' cannot alter inventory, pity, reservations, transactions or currency');}
  assert.equal(w.document.getElementById('kzHeaderChakra').textContent,'937');
  for(const [tab,active]of [['wiki','universes'],['rank','community']]){game.showTab(tab);await settle();const link=w.document.querySelector('.kz-shell-nav [data-tab="'+active+'"]');assert.equal(link.getAttribute('aria-current'),'page');assert.ok(link.classList.contains('active'),'Legacy '+tab+' route retains its grouped navigation highlight');}
  w.location.hash='#universes';await settle();assert.equal(w.document.body.dataset.tab,'universes');
  const names=[...w.document.querySelectorAll('#kzUniverseGrid .kz-universe-name')].map(n=>n.textContent);assert.equal(names.length,39);assert.deepEqual(names,[...names].sort(new Intl.Collator('fr',{sensitivity:'base',numeric:true}).compare));
  control('kzUniverseSearch','Naruto');assert.equal(w.document.querySelectorAll('#kzUniverseGrid [data-kz-album]').length,1);w.document.querySelector('#kzUniverseGrid [data-kz-album]').click();await settle();assert.equal(w.document.body.dataset.tab,'col');assert.equal(w.document.getElementById('colAlbumTitle').textContent,'Naruto');assert.equal(w.document.getElementById('colAlbumDetail').hidden,false);
  game.showTab('universes');control('kzUniverseSearch','no-such-universe-qa');assert.match(w.document.getElementById('kzUniverseGrid').textContent,/Aucun univers/);control('kzUniverseSearch','');
  const retainedUser=account.user;account={...account,user:null};const accountBefore=economic();const button=w.document.getElementById('kzNotifications');button.focus();button.click();const dialog=w.document.getElementById('kzNoticeDialog');assert.ok(dialog.open);assert.match(dialog.textContent,/Mode invité/);assert.match(dialog.textContent,new RegExp(myth.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.ok(!dialog.textContent.includes('retained-sale'));dialog.querySelector('[data-kz-close]').click();assert.equal(dialog.open,false);assert.equal(w.document.activeElement,button,'Closing notifications restores focus');assert.deepEqual(economic(),accountBefore);
  account={...account,error:'<img src=x onerror=alert(1)> Synchronisation indisponible'};button.click();assert.ok(!dialog.querySelector('img'),'Account error text is never injected as HTML');assert.match(dialog.textContent,/Synchronisation indisponible/);dialog.querySelector('[data-kz-close]').click();
  account={...account,loading:true,error:''};button.click();assert.match(dialog.textContent,/Chargement/);assert.ok(!dialog.textContent.includes(myth.name),'An account loading state must not expose the prior player discoveries');dialog.querySelector('[data-kz-close]').click();
  account={...account,user:retainedUser,loading:false,error:''};
  game.showTab('wiki');assert.equal(game.openCard(other.id),true);await settle();
  const profile=w.document.getElementById('kyaraProfileOverlay');assert.ok(profile.classList.contains('open'));assert.match(w.location.hash,/^#character\//);
  const profileBooster=profile.querySelector('[data-cp-action="boosters"]');assert.ok(profileBooster,'An unowned character sheet offers the real booster destination');profileBooster.click();await pause(120);
  assert.equal(profile.classList.contains('open'),false);assert.equal(w.document.body.dataset.tab,'boosts','The character-sheet booster action must survive asynchronous history restoration');assert.equal(w.location.hash,'#boosters');assert.deepEqual(economic(),before,'Leaving a character sheet for boosters never spends a pack or Chakra');
  assert.equal(game.openBoosterSelection('mix',5),true);assert.equal(w.document.getElementById('kyaraRevealRoot').dataset.phase,'pack');assert.deepEqual(economic(),before,'Choosing a five-pack preview is not an opening');
  const change=w.document.querySelector('#kyaraRevealRoot [data-kr-action="change"]');assert.ok(change);change.click();await settle();assert.equal(w.document.body.dataset.tab,'boosts');assert.equal(w.location.hash,'#boosters');assert.equal(w.document.getElementById('revealBackdrop').classList.contains('open'),false);assert.deepEqual(economic(),before,'Changing a booster from its preview must never charge or draw');
  for(const [key,value]of Object.entries(storageBefore))assert.equal(w.localStorage.getItem(key),value,'Navigation and notifications leave legacy storage '+key+' byte-for-byte unchanged');
  account={user:null,profile:null,status:'guest',loading:false,error:''};game.applySnapshot({username:'Invité',owned:[],pulls:[],chakra:500,stock:{free:3,t:Date.now(),inv:2,pm:0,pl:0,day:''}});button.click();assert.match(dialog.textContent,/Mode invité/);assert.match(dialog.textContent,/Aucune découverte/);dialog.querySelector('[data-kz-close]').click();
  // The old economic keys were preserved throughout navigation, before applying
  // the deliberately separate empty-player fixture above.
  assert.ok(Object.keys(storageBefore).length>=4);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  const css=await fs.readFile('dist/kizuna-shell.css','utf8')+await fs.readFile('dist/kizuna-identity.css','utf8');
  assert.match(css,/prefers-reduced-motion/);assert.match(css,/@media/);assert.match(html,/class="kz-skip"/);assert.match(html,/id="mainContent" tabindex="-1"/);
  console.log(JSON.stringify({backup:'raw 5003 copies / 83 transactions; strict allowlist; auth excluded; no overwrite; failure-safe',routes:'direct and header destinations; legacy grouping; OAuth query preserved',albums:'French A–Z, search and exact album destination',notifications:'real pulls, loading/error/empty, escaping and focus restoration',economy:'copies, duplicates, Chakra, pity, stock, reservations and history unchanged by navigation',networkRequests:requests.length,errors,visualLimit:'DOM/static responsive and reduced-motion checks; no real browser screenshot'}));
}finally{dom.window.close();}
