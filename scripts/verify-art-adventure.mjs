import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {transform} from 'esbuild';

// Exercise the actual adventure rules and controller with a deliberately isolated
// account transport: no timers, live accounts, currencies or catalogue writes.
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM('<!doctype html><body class="kz-art" data-tab="home"><main><section id="home"></section></main></body>',{url:'https://kizuna.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document,copy=x=>JSON.parse(JSON.stringify(x)),wait=()=>new Promise(r=>setTimeout(r,15)),fixed=Date.parse('2026-11-04T18:00:00Z');
w.Date.now=()=>fixed;const scrolls=[],focusCalls=[],rewardEvents=[],viewEvents=[];
w.scrollTo=(...args)=>scrolls.push(args);const focus=w.HTMLElement.prototype.focus;w.HTMLElement.prototype.focus=function(options){focusCalls.push(options);return focus.call(this,options);};
const cards=[['cseed-0013','Naruto'],['cseed-0014','Sasuke'],['cseed-0015','Sakura'],['cseed-0016','Kakashi'],['cseed-0017','Itachi'],['cseed-0018','Madara']].map(([id,name])=>({id,name,series:'Naruto',image:'assets/fixture.jpg',rarity:'Mythique'}));
const economy={username:'Fixture',cards,owned:cards.slice(0,5).map(c=>({id:c.id,at:fixed-1000})),chakra:4321,stock:{free:22,t:fixed,inv:4},market:{listings:[]}},before=JSON.stringify(economy);
const albums=[{key:'naruto',name:'Naruto',cardIds:cards.map(c=>c.id),cover:'assets/fixture.jpg',owned:5,total:6},{key:'selection',name:'Sélection staff',cardIds:['cseed-0018'],cover:'assets/fixture.jpg',owned:0,total:1}];
let identity={user:null,loading:false},transport;
w.KizunaAccount={getSnapshot:()=>identity,adventureRequest:(...args)=>transport(...args)};
w.KizunaGame={getSnapshot:()=>copy(economy),getAlbums:()=>copy(albums),showTab:tab=>{d.body.dataset.tab=tab;},notify:()=>{},openCard:()=>{},openAlbumKey:()=>{}};
w.addEventListener('kizuna:reward',e=>rewardEvents.push(e.detail));w.addEventListener('kizuna:adventure-view-change',e=>viewEvents.push({hash:w.location.hash,...e.detail}));
const click=s=>{const b=d.querySelector(s);assert.ok(b,s);b.click();return b;};
try{
 for(const file of ['kizuna-adventure-rules.js','kizuna-adventure-data.js','kizuna-adventure.js'])w.eval(await fs.readFile('dist/'+file,'utf8'));
 await wait();const A=w.KizunaAdventure,R=w.KizunaAdventureRules;
 A.navigate('missions');await wait();assert.equal(d.getElementById('kzAdventurePage').dataset.artView,'missions');
 assert.match(viewEvents.at(-1).hash,/#adventure\/missions$/);
 assert.ok(d.querySelector('[data-quest-state="ready"]'));assert.ok(d.querySelector('[data-quest-state="progress"]'));
 assert.ok(!d.getElementById('kaAdventureContent').textContent.includes('Gardien de lumière'),'The locked secret reward remains concealed');
 click('[data-ka-mission-filter="ready"]');assert.ok(d.querySelectorAll('.kac-quest').length);assert.ok([...d.querySelectorAll('.kac-quest')].every(n=>n.dataset.questState==='ready'));
 click('[data-ka-claim="first-collection"]');await wait();assert.equal(rewardEvents.length,1);assert.equal(d.getElementById('kacRewardReceipt').hidden,false);assert.match(d.getElementById('kacRewardReceipt').textContent,/Premiers liens/);
 await A.perform('claim',{id:'first-collection'});assert.equal(rewardEvents.length,1,'Repeating an obtained claim does not celebrate again');
 click('[data-ka-mission-filter="claimed"]');assert.equal(d.querySelectorAll('.kac-quest').length,1);assert.equal(d.querySelector('.kac-quest').dataset.questState,'claimed');
 A.navigate('constellations');await wait();assert.equal(d.querySelectorAll('.ka-constellation-tile').length,7);click('[data-ka-select="team-seven"]');assert.equal(d.querySelectorAll('.ka-star-node.is-lit').length,4);assert.equal(d.querySelectorAll('.ka-map-canvas line.is-lit').length,5);click('[data-ka-map="in"]');assert.match(d.getElementById('kaMapCanvas').style.transform,/scale\(1.2\)/);
 A.navigate('journey');await wait();assert.equal(d.querySelectorAll('.ka-destination').length,albums.length);const search=d.getElementById('kaUniverseSearch');search.value='staff';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('.ka-destination').length,1);assert.equal(d.activeElement.id,'kaUniverseSearch');
 click('[data-ka-select="selection"]');assert.equal(d.querySelectorAll('.ka-missing-strip [data-ka-inspect]').length,1,'Managed album membership, not the character series, determines its missing cards');assert.equal(d.querySelector('.ka-missing-strip [data-ka-inspect]').dataset.kaInspect,'cseed-0018');

 let server=R.empty(),mode='get',resolvePending,rejectPending;
 const reply=extra=>({state:copy(server),definitions:copy(w.KizunaAdventureSeed),revision:3,server_now:fixed,...extra});
 transport=async(action,payload)=>{
  if(action==='get')return reply();
  if(mode==='pending')return new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject;});
  const def=w.KizunaAdventureSeed.find(row=>row.id===payload.id),p=R.measure(def,economy,server,w.KizunaAdventureSeed,fixed);
  server.claims[p.key]={id:def.id,kind:def.kind,label:def.reward_label,reward_kind:def.reward_kind,at:fixed};
  return reply(mode==='replay'?{replayed:true}:{});
 };
 identity={user:{id:'player-a'},loading:false};d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await wait();assert.equal(d.getElementById('kacRewardReceipt').hidden,true,'Account changes clear the previous account receipt');assert.equal(rewardEvents.length,1,'Loading a state is not an unlock');
 A.navigate('missions');mode='pending';const denied=A.perform('claim',{id:'first-collection'});assert.ok(d.querySelector('[data-ka-claim="first-collection"]').disabled,'Writes stay unavailable until the server answers');rejectPending(Error('REQUIREMENTS_NOT_MET'));assert.equal(await denied,false);assert.equal(rewardEvents.length,1);assert.ok(d.getElementById('kaStatus').classList.contains('is-error'));
 mode='replay';await A.perform('claim',{id:'first-collection'});assert.equal(rewardEvents.length,1,'Even a newly received server replay is not celebrated');assert.equal(d.getElementById('kacRewardReceipt').hidden,true);
 mode='accept';await A.perform('claim',{id:'daily-discovery'});assert.equal(rewardEvents.length,2);assert.equal(d.getElementById('kacRewardReceipt').hidden,false);
 mode='pending';const late=A.perform('claim',{id:'weekly-discovery'});identity={user:{id:'player-b'},loading:true};d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));resolvePending(reply());assert.equal(await late,false);assert.equal(rewardEvents.length,2);assert.equal(d.getElementById('kacRewardReceipt').hidden,true);assert.equal(Object.keys(A.getSnapshot().state.claims).length,0,'Late account A state never enters B');
 assert.equal(JSON.stringify(economy),before);assert.deepEqual(scrolls,[]);assert.ok(focusCalls.every(options=>options?.preventScroll),'Navigation, filtering and search preserve scroll while restoring focus');assert.deepEqual(errors,[]);
 const css=await transform(await fs.readFile('dist/kizuna-art-adventure.css','utf8'),{loader:'css'});assert.deepEqual(css.warnings,[]);
 console.log(JSON.stringify({missions:'real status filters, concealed secrets, focus retained',claims:'server success only, rejection/replay/account isolation',constellations:'actual four portraits and five links',journey:'real albums, search focus, managed membership',economy:'unchanged',scroll:'unchanged',css:'parsed without warnings'}));
}finally{dom.window.close();}
