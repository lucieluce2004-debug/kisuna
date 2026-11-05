import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const source=await fs.readFile('dist/kizuna-adventure-admin.js','utf8'),errors=[],calls=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM('<main><section id="staffPage"><div class="ks-wrap"><nav class="ks-tabs"><button>Inscriptions</button></nav><section class="ks-panel"></section></div></section></main>',{url:'https://kizuna.example/',runScripts:'outside-only',virtualConsole:vc});
const w=dom.window,d=w.document;let current={user:{id:'a'},isAdmin:true,loading:false},defs=[],pending=null;
const wait=()=>new Promise(r=>setTimeout(r,15));
const cardRows=JSON.parse(await fs.readFile('seed/catalogue.json','utf8')).map(r=>r.card);
w.KizunaGame={getSnapshot:()=>({cards:cardRows})};w.KizunaAdventure={adminSaved(){}};
w.KizunaAccount={getSnapshot:()=>current,adventureRequest:async(action,payload)=>{calls.push({action,payload});if(pending)return new Promise(r=>pending.resolve=r);if(action==='definition_save'){const old=defs.find(d=>d.id===payload.id);const row={...payload,revision:(old?.revision||0)+1};defs=defs.filter(d=>d.id!==row.id).concat(row);}return {definitions:structuredClone(defs),state:{},revision:0};}};
try{
 w.eval(source);await wait();d.getElementById('kaStaffTab').click();await wait();assert.ok(d.getElementById('kaDefinitionForm').elements.title);
 let form=d.getElementById('kaDefinitionForm'),f=form.elements;f.id.value='test-event';f.title.value='Festival <img src=x>';f.reward_label.value='Éclat test';f.starts_at.value='2026-11-04T00:00';f.ends_at.value='2026-11-11T00:00';f.enabled.checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
 const save=calls.find(c=>c.action==='definition_save');assert.ok(save);assert.equal(save.payload.starts_at,'2026-11-04T00:00:00Z');assert.equal(save.payload.enabled,true);assert.equal(d.querySelector('#kaDefinitionList img'),null,'Admin strings are escaped');assert.match(d.getElementById('kaStaffStatus').textContent,/enregistrée/);
 d.querySelector('[data-ka-admin="new"]').click();form=d.getElementById('kaDefinitionForm');f=form.elements;f.kind.value='constellation';f.kind.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(f.metric.value,'cards');assert.equal(f.source_url.required,true);assert.equal(d.getElementById('kaDefinitionMembers').hidden,false);
 f.id.value='test-link';f.title.value='Un vrai lien';f.reward_label.value='Titre';f.source_url.value='https://naruto-official.com/';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.match(d.getElementById('kaStaffStatus').textContent,/deux à douze/);
 const search=d.getElementById('kaDefinitionSearch');search.value='Naruto';search.dispatchEvent(new w.Event('input',{bubbles:true}));const choices=[...d.querySelectorAll('[data-ka-definition-card]')].slice(0,2);for(const x of choices){x.checked=true;x.dispatchEvent(new w.Event('change',{bubbles:true}));}
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();const link=calls.filter(c=>c.action==='definition_save').at(-1);assert.equal(link.payload.requirements.card_ids.length,2);assert.equal(link.payload.requirements.edges.length,1);
 pending={};d.querySelector('[data-ka-admin="refresh"]').click();await wait();current={user:{id:'m'},isAdmin:false,staffRole:'moderator',loading:false};d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));pending.resolve({definitions:[{id:'leak',title:'old admin data'}]});await wait();assert.equal(d.getElementById('ks-adventure'),null);assert.equal(d.getElementById('kaStaffTab'),null);
 current={user:{id:'b'},isAdmin:true,loading:false};pending=null;d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await wait();d.getElementById('kaStaffTab').click();await wait();assert.ok(d.getElementById('kaDefinitionForm'));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({admin:'create, edit, publish, UTC event dates, exact member selection',validation:'members, official source, types',escaping:'passed',permissions:'moderator sees no tools, late admin response discarded',errors}));
}finally{dom.window.close();}
