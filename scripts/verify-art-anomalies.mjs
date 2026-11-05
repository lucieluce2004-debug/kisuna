import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM('<!doctype html><body class="kz-art" data-tab="adventure"><main><section id="target"></section></main>',{url:'https://kizuna.test/#adventure/events',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document,clone=x=>JSON.parse(JSON.stringify(x)),clock=Date.now(),iso=offset=>new Date(clock+offset).toISOString(),flush=()=>new Promise(r=>setTimeout(r,30));
let owner='a',replay=false,pending=null,route='',claims=0,sounds=0,celebrations=0;
const challenge=(id,kind='badge')=>({id,label:'Défi <réel>',description:'Réunir trois cartes.',difficulty:'discovery',goal:3,value:3,claimed:false,reward:{kind,label:'Insigne des liens',style:'convergence'}});
let rows=[{id:'active',config:{title:'Convergence <test>',description:'Passage ouvert.',theme:'convergence',starts_at:iso(-60000),ends_at:iso(60000),challenges:[challenge('a'),challenge('b','frame')]}},{id:'future',config:{title:'Nocturne',description:'Programmé.',theme:'nocturne',starts_at:iso(120000),ends_at:iso(240000),challenges:[challenge('c','effect')]}},{id:'past',config:{title:'Éclipse passée',description:'Archivée.',theme:'eclipse',starts_at:iso(-240000),ends_at:iso(-120000),challenges:[{...challenge('d','title'),claimed:true}]}}];
const result=()=>({events:clone(rows),rewards:[],selection:{},server_now:clock});
w.KIZUNA_CONFIG={};w.KizunaGame={showTab:key=>route=key,notify(){}};w.KizunaExperience={sfx:()=>sounds++};
w.KizunaAccount={getSnapshot:()=>({user:{id:owner},loading:false}),anomalyRequest:async(action,payload)=>{if(action==='get'&&pending)return new Promise(r=>pending.resolve=r);if(action==='claim'){claims++;rows.find(e=>e.id===payload.event).config.challenges.find(c=>c.id===payload.challenge).claimed=true;return {...result(),replayed:replay};}return result();}};
w.addEventListener('kizuna:reward',()=>celebrations++);
const click=selector=>{const n=d.querySelector(selector);assert.ok(n,selector);n.focus();n.click();};
try{
 w.eval(await fs.readFile('dist/kizuna-anomalies.js','utf8'));await flush();w.KizunaAnomalies.renderInto(d.getElementById('target'));
 assert.equal(d.querySelector('[data-kan-shelf="live"] b').textContent,'2');assert.equal(d.querySelector('[data-kan-shelf="archive"] b').textContent,'1');assert.equal(d.querySelectorAll('test').length,0);assert.equal(d.querySelector('.kac-reward-arrival'),null);
 assert.equal(d.querySelectorAll('.kac-reward-emblem svg').length,2);assert.equal(d.querySelector('[data-kan-claim="a"]').disabled,false);
 click('[data-kan-shelf="archive"]');assert.equal(d.querySelectorAll('.kac-archive-gallery button').length,1);assert.equal(d.querySelector('[data-kan-phase]').dataset.kanPhase,'ended');assert.ok([...d.querySelectorAll('[data-kan-claim]')].every(b=>b.disabled));assert.equal(d.querySelector('[data-kan-countdown]'),null,'An ended chapter does not restart a countdown');assert.equal(d.activeElement.dataset.kanShelf,'archive');
 click('[data-kan-shelf="live"]');click('[data-kan-event="future"]');assert.ok([...d.querySelectorAll('[data-kan-claim]')].every(b=>b.disabled));click('[data-kan-event="active"]');
 click('[data-kan-claim="a"]');click('[data-kan-claim="a"]');await flush();assert.equal(claims,1);assert.equal(celebrations,1);assert.equal(sounds,1);assert.ok(d.querySelector('.kac-reward-arrival'));assert.ok(d.querySelector('[data-kan-claim="a"]').disabled);
 replay=true;click('[data-kan-claim="b"]');await flush();assert.equal(claims,2);assert.equal(celebrations,1,'A replay cannot celebrate again');assert.equal(sounds,1);
 pending={};const flight=w.KizunaAnomalies.refresh(true);await flush();const resolve=pending.resolve;pending=null;owner='b';rows=[];d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));resolve({events:[{id:'private',config:{title:'Ancien compte'}}],rewards:[],selection:{},server_now:clock});await flight;await flush();assert.equal(w.KizunaAnomalies.getSnapshot().events.length,0);assert.equal(d.querySelector('.kac-reward-arrival'),null);assert.match(d.querySelector('.kan-empty').textContent,/Aucune Anomalie/);
 click('[data-kan-boosters]');assert.equal(route,'boosts');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({archives:'ended real events, read-only; future locked',rewards:'distinct illustrated kinds',claim:'single verified transition, replay silent',identity:'late previous response discarded',empty:'honest, working booster route',focus:'preserved',errors:0}));
}finally{w.close()}
