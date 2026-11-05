import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const html=await fs.readFile('dist/index.html','utf8');
const errors=[],requests=[],v=new VirtualConsole();v.on('jsdomError',e=>{if(!/Could not parse CSS/.test(e.message))errors.push(e.message)});v.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(html,{url:'https://kizuna.aleklecaribou.chatgpt.site/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:v}),w=dom.window,d=w.document;
// Freeze the browser clock so a full free reserve cannot advance stock.t between cosmetic assertions.
const fixedNow=Date.now();w.Date.now=()=>fixedNow;
w.scrollTo=()=>{};w.confirm=()=>true;w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.fetch=async url=>{requests.push(String(url));throw Error('Unexpected request');};
const wait=async()=>{await new Promise(r=>setTimeout(r,40));};const click=selector=>{const b=d.querySelector(selector);assert.ok(b,'Missing '+selector);b.click();return b;};const plain=x=>JSON.parse(JSON.stringify(x));
try{
 for(const script of d.scripts){const src=script.getAttribute('src');const code=src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent;new vm.Script(code);w.eval(code);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
 await wait();const game=w.KizunaGame,A=w.KizunaAdventure,R=w.KizunaAdventureRules;
 assert.ok(A);const at=Date.now()-1000;
 const rows=['cseed-0013','cseed-0013','cseed-0013','cseed-0013','cseed-0013','cseed-0014','cseed-0015','cseed-0016','cseed-0017'].map(id=>({id,at}));
 game.applySnapshot({username:'AdventureTest',owned:rows,pulls:[],chakra:1234,stock:{free:42,t:Date.now(),inv:37,pm:129,pl:28,day:'retained'},market:{listings:[{id:'escrow',cardId:'cseed-0089',seller:'AdventureTest',mode:'sale',status:'active',price:200,createdAt:at,reservedCopy:{id:'cseed-0089',at}}],history:[],wishlist:[]}});
 const economic=()=>JSON.stringify(game.getSnapshot());const before=economic();
 const scrolls=[];w.scrollTo=(...args)=>scrolls.push(args);
 A.navigate('constellations');await wait();assert.equal(d.body.dataset.tab,'adventure');assert.equal(d.querySelectorAll('.ka-constellation-tile').length,7);
 assert.equal(scrolls.length,0,'Opening adventure preserves the current scroll');
 click('[data-ka-view="missions"]');await wait();click('[data-ka-view="constellations"]');await wait();
 assert.equal(scrolls.length,0,'Switching mission and constellation tabs does not scroll to the top');
 assert.equal(w.location.hash,'#adventure/constellations');
 click('[data-ka-select="rivals-konoha"]');assert.equal(d.querySelectorAll('.ka-star-node.is-lit').length,2);assert.equal(d.querySelectorAll('.ka-map-canvas line.is-lit').length,1);
 click('[data-ka-map="in"]');assert.match(d.getElementById('kaMapCanvas').style.transform,/1.2/);click('[data-ka-map="reset"]');
 click('[data-ka-claim="rivals-konoha"]');await wait();assert.equal(Object.keys(A.getSnapshot().state.claims).length,1);assert.equal(economic(),before);assert.equal(d.querySelector('[data-ka-claim="rivals-konoha"]').disabled,true);
 A.navigate('awakening','cseed-0013');await wait();click('[data-km-preview-level="2"]');assert.equal(A.getSnapshot().state.awakened['cseed-0013'],undefined);assert.equal(d.querySelector('[data-km-equip]').disabled,true);assert.equal(economic(),before);
 const g=plain(game.getSnapshot()),empty=R.empty();assert.equal(R.awakening(g,empty,'cseed-0089').count,0,'Escrow never qualifies for awakening');assert.ok(R.copies(g).some(c=>c.id==='cseed-0089'),'Escrow remains a possessed card for nonconsuming links');
 A.navigate('journey');await wait();assert.equal(d.querySelectorAll('.ka-destination').length,39);const destination=[...d.querySelectorAll('.ka-destination')].find(b=>b.textContent.includes('Naruto'));destination.click();await wait();assert.ok(A.getSnapshot().state.visits.Naruto);assert.equal(economic(),before);
 A.navigate('missions');await wait();click('[data-ka-claim="daily-explore"]');await wait();assert.ok(Object.keys(A.getSnapshot().state.claims).some(k=>k.startsWith('daily-explore:')));
 const stateBefore=plain(A.getSnapshot().state),daily=w.KizunaAdventureSeed.find(d=>d.id==='daily-explore'),monday=Date.parse('2026-11-02T00:00:00Z');assert.equal(R.period({...daily,period:'week'},monday+6*86400000).start,monday);assert.notEqual(R.period(daily,monday+86400000).key,R.period(daily,monday).key);
 A.navigate('sanctuary');await wait();let form=d.getElementById('kaSanctuaryForm');form.elements.slot0.value='cseed-0013';form.elements.slot1.value='cseed-0014';form.elements.theme.value='aurora';form.querySelector('[name="favorite"][value="cseed-0013"]').checked=true;click('[data-ka-sanctuary-preview]');assert.equal(d.getElementById('kaPreviewDialog').open,true);assert.deepEqual(plain(A.getSnapshot().state),stateBefore,'Preview is not persistence');click('[data-ka-close-dialog]');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.deepEqual(plain(A.getSnapshot().state.sanctuary.cards),['cseed-0013','cseed-0014']);assert.equal(A.getSnapshot().state.sanctuary.public,false);assert.equal(economic(),before);await A.refresh();assert.deepEqual(plain(A.getSnapshot().state.sanctuary.cards),['cseed-0013','cseed-0014']);
 A.navigate('events');await wait();assert.match(d.getElementById('kaAdventureContent').textContent,/Aucune Anomalie/);assert.equal(economic(),before);
 game.showTab('wiki');game.openCard('cseed-0013');await wait();click('[data-ka-card-awakening]');await wait();assert.equal(d.body.dataset.tab,'adventure');assert.equal(d.getElementById('kyaraProfileOverlay').classList.contains('open'),false);assert.match(d.getElementById('kaAdventureContent').textContent,/Naruto/);
 const oldGet=w.KizunaAccount.getSnapshot;let resolve;
 w.KizunaAccount.getSnapshot=()=>({user:{id:'player-a'},profile:{username:'A'},loading:false,status:'synced'});w.KizunaAccount.adventureRequest=()=>new Promise(r=>resolve=r);d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await wait();assert.equal(Object.keys(A.getSnapshot().state.claims).length,0);
 w.KizunaAccount.getSnapshot=()=>({user:{id:'player-b'},profile:{username:'B'},loading:true});d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));resolve({state:stateBefore,definitions:w.KizunaAdventureSeed,revision:20,server_now:Date.now()});await wait();assert.equal(Object.keys(A.getSnapshot().state.claims).length,0,'Late account A data cannot leak into B');
 w.KizunaAccount.getSnapshot=oldGet;d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await wait();assert.equal(A.getSnapshot().state.claims['rivals-konoha'].kind,'constellation','Guest progression is retained independently');
 const publishedSanctuary=plain(A.getSnapshot().state);publishedSanctuary.sanctuary.public=true;const privacyCalls=[];
 w.KizunaAccount.getSnapshot=()=>({user:{id:'privacy-test'},profile:{username:'Test'},loading:false,status:'synced'});w.KizunaAccount.adventureRequest=async action=>{privacyCalls.push(action);if(action==='private')publishedSanctuary.sanctuary.public=false;return {state:plain(publishedSanctuary),definitions:w.KizunaAdventureSeed,revision:30,server_now:Date.now()};};
 const design=w.KizunaStudio.defaults();design.features.sanctuary=false;w.KizunaStudio.accept(design);d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));A.navigate('sanctuary');await wait();assert.equal(d.querySelector('[data-ka-view="sanctuary"]').hidden,false,'A public gallery retains its privacy shortcut even when the feature is disabled');click('[data-ka-make-private]');await wait();assert.ok(privacyCalls.includes('private'));assert.equal(A.getSnapshot().state.sanctuary.public,false);assert.equal(d.querySelector('[data-ka-make-private]'),null);w.KizunaAccount.getSnapshot=oldGet;w.KizunaStudio.accept(w.KizunaStudio.defaults());d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await wait();
 assert.equal(economic(),before);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const duplicateIds=[...d.querySelectorAll('[id]')].map(n=>n.id).filter((id,index,all)=>all.indexOf(id)!==index);assert.deepEqual(duplicateIds,[],'No duplicate IDs including auction and adventure views');
 console.log(JSON.stringify({constellations:'exact IDs, lit links, zoom, claim once',awakening:'Mythic preview, authenticated progression only, no consumption',missions:'UTC day/week, real visits, idempotent rewards',journey:'39 actual albums',sanctuary:'preview, ordered selections, favorites, private default, persistence',events:'honest empty state',accounts:'late-response isolation and guest preservation',legacySnapshot:'unchanged',network:requests.length,errors}));
}finally{dom.window.close();}
