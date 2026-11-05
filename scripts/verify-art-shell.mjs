import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body data-tab="home"><a class="brand-logo"></a><nav class="kz-shell-nav"><a data-tab="home">Accueil</a><a data-tab="boosts">Boosters</a><a data-tab="col">Collection</a><a data-tab="universes">Univers</a><a data-tab="market">Marché</a></nav>',{runScripts:'outside-only',url:'https://kizuna.test'});
const w=dom.window,d=w.document,calls=[];
w.KizunaGame={showTab:key=>{calls.push(['game',key]);d.body.dataset.tab=key;w.dispatchEvent(new w.CustomEvent('kizuna:tab-change'));}};
w.KizunaAdventure={navigate:key=>calls.push(['adventure',key])};w.KizunaAnomalies={open:()=>calls.push(['anomalies'])};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
try{
 w.eval(await fs.readFile('dist/kizuna-art.js','utf8'));
 const trigger=d.getElementById('kzaMenuButton'),dialog=d.getElementById('kzaNavigation');
 assert.equal(d.querySelectorAll('.kza-primary-destination').length,4);
 trigger.focus();trigger.click();assert.equal(dialog.open,true);assert.equal(trigger.getAttribute('aria-expanded'),'true');
 assert.equal(dialog.querySelectorAll('[data-kza-destination]').length,16);assert.equal(dialog.querySelector('[data-kza-destination="staff"]'),null);
 dialog.querySelector('[data-kza-destination="col"]').click();assert.deepEqual(calls.pop(),['game','col']);assert.equal(dialog.open,false);assert.equal(d.activeElement,trigger);assert.equal(d.getElementById('kzaHeaderContext').textContent,'Mes albums');
 for(const route of ['missions','constellations','journey','awakening','sanctuary']){trigger.click();dialog.querySelector('[data-kza-destination="'+route+'"]').click();assert.deepEqual(calls.pop(),['adventure',route]);}
 trigger.click();dialog.querySelector('[data-kza-destination="events"]').click();assert.deepEqual(calls.pop(),['anomalies']);
 const staff=d.createElement('a');staff.id='staffNav';staff.dataset.tab='staff';d.querySelector('nav').append(staff);await Promise.resolve();trigger.click();assert.ok(dialog.querySelector('[data-kza-destination="staff"]'));dialog.close();
 staff.hidden=true;trigger.click();assert.equal(dialog.querySelector('[data-kza-destination="staff"]'),null);dialog.close();
 const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
 assert.equal(w.localStorage.length,0);assert.equal(calls.length,0);
 console.log(JSON.stringify({navigation:'16 destinations, staff conditional',mobileDock:4,routeApis:'unchanged',focusRestored:true,duplicateIds:0,economicWrites:0}));
}finally{w.close()}
