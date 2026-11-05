import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {JSDOM,VirtualConsole}=require('jsdom');
const html=await fs.readFile('dist/index.html','utf8');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/CSS stylesheet/.test(e.message))errors.push(e.message)});
const dom=new JSDOM(html,{url:'https://kizuna.example.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.fetch=async()=>{throw new Error('Unexpected network')};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
try{
  for(const script of w.document.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await new Promise(resolve=>setTimeout(resolve,30));
  for(const id of ['kzHomeOwned','kzHomeTotal','kzHomePercent','kzHomeProgress','kzHomeUniverses','kzResumeLabel','kzFeaturedName','kzFeaturedDescription','kzFeaturedCost','kzNewsCards','kzHomeError','kzResume','kzFeaturedOpen'])assert.ok(w.document.getElementById(id),'Actual home markup contains '+id);
  let identity={user:{id:'test-a'},loading:false,status:'synced'};w.KizunaAccount.getSnapshot=()=>identity;
  const game=w.KizunaGame,cards=game.getSnapshot().cards,first=cards[0],second=cards.find(c=>c.series!==first.series);
  game.applySnapshot({owned:[{id:first.id,at:1700000000000},{id:first.id,at:1700000000001},{id:second.id,at:1700000000002}],chakra:987,username:'TestA',stock:{free:28,inv:6,pm:11,pl:3,t:Date.now(),day:'preserve'}});
  const before=JSON.stringify(game.getSnapshot());
  w.KizunaHome.refresh();const flush=()=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));await flush();
  assert.equal(game.getHomeSummary().owned,2);assert.equal(game.getHomeSummary().copies,3);assert.equal(w.document.getElementById('kzHomeOwned').textContent,'2');assert.equal(game.getHomeSummary().featured.stock,34);assert.equal(game.getHomeSummary().featured.legendaryRemaining,47);assert.equal(game.getHomeSummary().featured.mythicRemaining,239);assert.equal(game.getHomeSummary().discoveries.length,4);assert.equal(new Set(game.getHomeSummary().discoveries.map(c=>c.series)).size,4);
  assert.equal(JSON.stringify(game.getSnapshot()),before,'Home render must preserve all game state');
  const albums=game.getAlbums();assert.deepEqual(Array.from(albums,a=>a.name),Array.from(albums,a=>a.name).sort(new Intl.Collator('fr',{sensitivity:'base',numeric:true}).compare));assert.ok(Object.isFrozen(albums));assert.ok(Object.isFrozen(albums[0].cardIds));
  assert.equal(game.openAlbumKey(albums[0].key),true);await flush();assert.ok(w.document.getElementById('kzResumeLabel').textContent.includes(albums[0].name));assert.equal(JSON.parse(w.localStorage.getItem('kizuna_journey_v1_user_test-a')).albumKey,albums[0].key);
  game.showTab('home');await flush();const discovery=w.document.querySelector('[data-kz-home-card]');discovery.focus();w.KizunaHome.refresh();await flush();assert.equal(w.document.activeElement,discovery,'Unchanged metadata refresh retains the focused discovery button');
  const summaryFn=game.getHomeSummary;game.getHomeSummary=()=>{throw new Error('Synthetic read failure')};w.KizunaHome.refresh();await flush();assert.equal(w.document.getElementById('kzHomeError').hidden,false);assert.match(w.document.getElementById('kzHomeError').textContent,/indisponible/);game.getHomeSummary=summaryFn;w.KizunaHome.refresh();await flush();assert.equal(w.document.getElementById('kzHomeError').hidden,true);
  identity={user:{id:'test-b'},loading:true,status:'initializing'};w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await flush();assert.equal(w.document.getElementById('kzHomeOwned').textContent,'—');assert.equal(w.document.getElementById('kzHomeUniverses').children.length,0);assert.equal(w.document.getElementById('kzResume').disabled,true);
  identity={user:{id:'test-b'},loading:false,status:'synced'};game.applySnapshot({owned:[],chakra:500,username:'TestB'});w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await flush();assert.equal(w.document.getElementById('kzHomeOwned').textContent,'0');assert.equal(w.document.getElementById('kzResumeLabel').textContent,'Commencer mon premier album');assert.ok(!w.localStorage.getItem('kizuna_journey_v1_user_test-b'));
  const noSpend=game.getSnapshot();w.document.getElementById('kzFeaturedOpen').click();assert.equal(w.document.getElementById('kyaraRevealRoot').dataset.phase,'pack');assert.equal(game.getSnapshot().stock.free,noSpend.stock.free);assert.equal(game.getSnapshot().stock.inv,noSpend.stock.inv);assert.equal(game.getSnapshot().chakra,noSpend.chakra);assert.deepEqual(Array.from(game.getSnapshot().owned),Array.from(noSpend.owned));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({homeProgress:'real distinct cards and copies',featured:'real stock and pity with no preview spend',albums:'French alphabetical immutable summaries',resume:'real album route, isolated per identity',identityLoading:'previous progress hidden',focusedRefresh:'preserved',errorState:'visible and recoverable',gameStatePreserved:true,consoleErrors:0}));
}finally{dom.window.close()}
