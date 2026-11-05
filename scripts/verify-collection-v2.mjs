import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=await fs.readFile('dist/index.html','utf8');
assert.ok(html.includes('function collectionStatus()'),'Build/integrate the collection feature before running this suite');
const errors=[],vc=new VirtualConsole();
vc.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.message);});
vc.on('error',(...args)=>errors.push(args.map(String).join(' ')));
const dom=new JSDOM(html,{url:'https://kizuna.example.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;w.scrollTo=()=>{};w.AbortSignal=AbortSignal;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.fetch=async()=>{throw Error('Unexpected network');};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,30));
const $=id=>w.document.getElementById(id);
const ids=()=>Array.from(w.document.querySelectorAll('#colGrid [data-colcard]'),node=>node.dataset.colcard);
const control=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));};
const canonical=value=>JSON.parse(JSON.stringify(value));
try{
  for(const script of w.document.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await sleep();
  const cards=Array.from(w.KizunaGame.getSnapshot().cards),[a,b,c,d]=cards;
  const now=Date.now();w.Date.now=()=>now;
  const sample={username:'Collection QA',chakra:1234,stock:{free:23,inv:12,pm:13,pl:7,t:now,day:''},owned:[{id:a.id,at:now-4000},{id:a.id,at:now-3000},{id:b.id,at:now-1000}],pulls:[],market:{listings:[{id:'reserved-card',cardId:c.id,seller:'Collection QA',mode:'auction',status:'active',price:300,topBid:350,bidder:'Autre',createdAt:now,endsAt:now+1000,reservedCopy:{id:c.id,at:now-2500}},{id:'reserved-also-owned',cardId:a.id,seller:'Collection QA',mode:'sale',status:'active',price:300,createdAt:now,endsAt:now+86400000,reservedCopy:{id:a.id,at:now-3500}}],history:[{id:'real-transaction',type:'sale',cardId:b.id,at:now-5000,gross:100,fee:5,net:95,seller:'Collection QA',buyer:'Autre'}],wishlist:[d.id],credits:{},cards:[]}};
  w.KizunaGame.applySnapshot(sample);w.KizunaGame.showTab('col');
  const baseline=canonical(w.KizunaGame.getSnapshot());
  // Expiry must be settled by market flows, never as a side effect of filtering.
  // This listing is still active in the retained snapshot and owns its escrow.
  w.Date.now=()=>now+2000;
  control('colOwn','dup');assert.deepEqual(ids(),[a.id],'Only freely available duplicate copies match');
  assert.equal(w.document.querySelector('[data-colcard]').classList.contains('owned'),true);
  assert.match(w.document.querySelector('.kz-col-status').textContent,/Doublon/);
  assert.match(w.document.querySelector('.kz-col-status').textContent,/réservée/);
  control('colOwn','reserved');assert.deepEqual(new Set(ids()),new Set([a.id,c.id]));
  const reserved=w.document.querySelector('[data-colcard="'+c.id+'"]');
  assert.ok(reserved.classList.contains('reserved'));
  assert.equal(reserved.closest('.col-item-unit').querySelector('[data-col-market-open]'),null,'A reserved-only copy cannot be offered for sale again');
  assert.equal(reserved.querySelector('.missing-lock'),null,'Reserved is distinct from missing');
  control('colOwn','wanted');assert.deepEqual(ids(),[d.id]);assert.match(w.document.querySelector('.kz-col-status').textContent,/Recherchée/);
  control('colOwn','miss');assert.ok(!ids().includes(c.id),'Escrow is not reported as an unobtained character');assert.ok(!ids().includes(a.id));
  control('colOwn','own');assert.deepEqual(new Set(ids()),new Set([a.id,b.id]));
  control('colSort','recent');assert.deepEqual(ids(),[b.id,a.id]);
  control('colSort','name');assert.deepEqual(ids(),[a,b].sort((x,y)=>x.name.localeCompare(y.name,'fr',{sensitivity:'base',numeric:true})).map(card=>card.id));

  const flip=w.document.querySelector('[data-col-flip="'+a.id+'"]');
  flip.focus();flip.click();
  let face=w.document.querySelector('[data-colcard="'+a.id+'"] .fcard');
  assert.ok(face.classList.contains('flipped'));assert.equal(flip.getAttribute('aria-pressed'),'true');assert.equal(w.document.activeElement,flip);
  assert.equal(face.querySelector('.ff').getAttribute('aria-hidden'),'true');assert.equal(face.querySelector('.fb').getAttribute('aria-hidden'),'false');
  const source=face.querySelector('.fb a');assert.equal(source.tabIndex,0);
  let sourceReached=false;source.addEventListener('click',event=>{sourceReached=true;event.preventDefault();},{once:true});source.click();assert.ok(sourceReached,'Source-link click is not swallowed by the card open handler');
  flip.click();assert.equal(source.tabIndex,-1);assert.equal(face.classList.contains('flipped'),false);
  w.document.querySelector('[data-col-open="'+a.id+'"]').click();assert.ok($('detailBackdrop').classList.contains('open'));assert.equal($('detailTitle').textContent,a.name);$('detailClose').click();

  control('colSearch','does-not-exist-7653');assert.deepEqual(ids(),[]);assert.match($('colGrid').textContent,/filtres/);
  $('colFiltersReset').click();assert.equal($('colSearch').value,'');assert.equal($('colOwn').value,'all');assert.equal($('colSort').value,'num');assert.equal(w.document.activeElement,$('colSearch'));assert.equal(ids().length,60);
  const firstPage=ids();$('colMore').focus();$('colMore').click();assert.equal(ids().length,120);assert.equal(w.document.activeElement.dataset.colcard,ids()[60]);assert.deepEqual(ids().slice(0,60),firstPage);
  const rarity=$('colChips').querySelector('[data-r="Épique"]');rarity.focus();rarity.click();assert.equal(w.document.activeElement.dataset.r,'Épique');assert.equal(w.document.activeElement.getAttribute('aria-pressed'),'true');
  $('colFiltersReset').click();control('colSearch',a.name.normalize('NFD').replace(/[\u0300-\u036f]/g,''));assert.ok(ids().includes(a.id));

  w.KizunaGame.showAlbums();const titles=Array.from(w.document.querySelectorAll('.col-album h3'),node=>node.textContent);assert.deepEqual(titles,[...titles].sort(new Intl.Collator('fr',{sensitivity:'base',numeric:true}).compare));
  const tile=w.document.querySelector('.col-album');tile.click();const albumName=$('colAlbumTitle').textContent;control('colOwn','dup');$('colFiltersReset').click();assert.equal($('colAlbumTitle').textContent,albumName,'Resetting filters keeps the exact selected album');assert.equal($('colAlbumDetail').hidden,false);
  $('colAlbumBack').click();assert.equal($('colAlbums').hidden,false);
  assert.deepEqual(canonical(w.KizunaGame.getSnapshot()),baseline,'Reading/filtering/turning cards must preserve every card, wallet, reserve, pity, listing and transaction');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({collectionFilters:'available/missing/duplicate/wanted/reserved',sort:'recent and French name',reservedCopies:'read-only, never sellable twice',cardControls:'explicit view and keyboard-safe verso/source',progressiveRendering:'60 then 120 with focus on first added card',albums:'A–Z and exact detail/reset/back',economy:'unchanged',errors:0}));
}finally{dom.window.close();}
