import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {transform} from 'esbuild';

// Use the built module when integrated, otherwise inject its exact source into
// an isolated page so this suite also validates the bounded implementation task.
let html=await fs.readFile('dist/index.html','utf8');
if(!html.includes('const kzwState='))html=html.replace('/* KIZUNA_GAME_BRIDGE_BEGIN */',(await fs.readFile('src/wiki-view.inc.js','utf8'))+'\n/* KIZUNA_GAME_BRIDGE_BEGIN */');
const errors=[],network=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>{if(!/CSS stylesheet/.test(e.message))errors.push(e.message);});
vc.on('error',(...args)=>errors.push(args.map(String).join(' ')));
const dom=new JSDOM(html,{url:'https://kizuna.example.test/#encyclopedia',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,$=id=>w.document.getElementById(id);
w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.fetch=async url=>{network.push(String(url));throw new Error('No live network in Wiki test');};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
const flush=()=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
const ids=()=>[...w.document.querySelectorAll('#wikiGrid [data-wiki]')].map(e=>e.dataset.wiki);
const select=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
const search=value=>{$('wikiSearch').value=value;$('wikiSearch').dispatchEvent(new w.Event('input',{bubbles:true}));};
const own=value=>{const b=w.document.querySelector('#v8WikiFilter [data-v8-wiki-filter="'+value+'"]');assert.ok(b);b.click();};
try{
  for(const script of w.document.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await flush();
  const game=w.KizunaGame,cards=Array.from(game.getSnapshot().cards),first=cards[0],second=cards.find(c=>c.series!==first.series);
  assert.equal(ids().length,60,'Initial catalogue rendering is bounded to sixty real cards');
  assert.equal(w.document.querySelectorAll('#kzwControls').length,1);
  assert.equal($('wikiSearch').labels[0].className,'kzw-search');
  assert.ok([...w.document.querySelectorAll('#wikiGrid [data-wiki]')].every(e=>e.tagName==='BUTTON'&&e.type==='button'));
  assert.deepEqual([...$('kzwUniverse').options].slice(1).map(o=>o.textContent),[...$('kzwUniverse').options].slice(1).map(o=>o.textContent).sort(new Intl.Collator('fr',{sensitivity:'base',numeric:true}).compare));
  const originalIds=ids();$('kzwMore').click();assert.equal(ids().length,120);assert.deepEqual(ids().slice(0,60),originalIds);assert.equal(w.document.activeElement.dataset.wiki,ids()[60],'Load-more focuses the first newly revealed card');
  const focused=w.document.activeElement;w.KizunaWiki.refresh();await flush();assert.equal(w.document.activeElement,focused,'An unchanged refresh retains focused card DOM');
  let identity={user:{id:'player-a'},loading:false,status:'synced'};w.KizunaAccount.getSnapshot=()=>identity;w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await flush();
  game.applySnapshot({owned:[{id:first.id,at:1700000000000},{id:first.id,at:1700000000001},{id:second.id,at:1700000000002}],pulls:[],username:'Wiki QA',chakra:937,stock:{free:31,inv:15,pm:18,pl:7,t:Date.now(),day:'keep'},market:{listings:[],credits:{},cards:[],history:[],wishlist:[second.id]}});
  w.KizunaWiki.reset();game.showTab('wiki');await flush();
  const protectedState=JSON.stringify(game.getSnapshot());
  own('own');assert.deepEqual(ids().sort(),[first.id,second.id].sort());
  own('duplicates');assert.deepEqual(ids(),[first.id]);assert.match(w.document.querySelector('.kzw-card-state').textContent,/2 exemplaires/);
  own('wishlist');assert.deepEqual(ids(),[second.id]);assert.match(w.document.querySelector('.kzw-card-state').textContent,/Recherchée/);
  own('missing');assert.ok(ids().every(id=>id!==first.id&&id!==second.id));
  own('all');select('kzwUniverse',first.series);assert.ok(ids().length>0&&ids().every(id=>cards.find(c=>c.id===id).series===first.series));
  select('kzwRarity',first.rarity);assert.ok(ids().every(id=>cards.find(c=>c.id===id).rarity===first.rarity));
  $('kzwReset').click();select('kzwSort','popularity');const popular=ids().map(id=>cards.find(c=>c.id===id));assert.ok(popular.every((c,i)=>i===0||Number(popular[i-1].fav)>=Number(c.fav)));
  select('kzwSort','rarity');const levels=['Commun','Peu commune','Rare','Épique','Légendaire','Mythique'];const ranked=ids().map(id=>cards.find(c=>c.id===id));assert.ok(ranked.every((c,i)=>i===0||levels.indexOf(ranked[i-1].rarity)>=levels.indexOf(c.rarity)));
  search('no-result-zzxyz');assert.equal(ids().length,0);assert.match($('wikiGrid').textContent,/Aucun personnage/);assert.equal($('kzwMore').hidden,true);
  w.document.querySelector('[data-kzw-reset]').click();assert.equal(ids().length,60);assert.equal($('wikiSearch').value,'');assert.equal(w.document.activeElement,$('wikiSearch'));
  assert.equal(JSON.stringify(game.getSnapshot()),protectedState,'Filter, sort, paging and empty-state recovery never write economic data');
  own('duplicates');identity={user:{id:'player-b'},loading:true,status:'loading'};w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await flush();assert.equal($('wikiSearch').value,'');assert.ok(w.document.querySelector('[data-v8-wiki-filter="all"]').classList.contains('active'));assert.ok(w.document.querySelector('[data-v8-wiki-filter="own"]').disabled);assert.equal(w.document.querySelectorAll('.kzw-card-quantity').length,0);assert.ok(!w.document.querySelector('.kzw-card-state').textContent.includes('Possédée'),'Old account ownership is hidden while the next account is loading');
  identity={user:{id:'player-b'},loading:false,status:'synced'};game.applySnapshot({owned:[],chakra:500,username:'Second'});w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await flush();own('own');assert.equal(ids().length,0);own('all');
  // Synthetic catalogue-only entry verifies Unicode search and safe text rendering.
  game.addCatalogueCards([{id:'c999999991',sourceId:'999999991',name:'Éloïse <img src=x>',native:'エロイーズ',series:'Univers Élan',image:'https://s4.anilist.co/test.jpg',fav:4,cats:[],g:'F'}]);
  search('eloise');assert.deepEqual(ids(),['c999999991']);assert.match(w.document.querySelector('.kzw-card-copy strong').textContent,/Éloïse <img/);assert.equal(w.document.querySelector('.kzw-card-copy img'),null,'User text cannot inject HTML');
  search('エロイーズ');assert.deepEqual(ids(),['c999999991']);search('univers elan');assert.deepEqual(ids(),['c999999991']);
  $('kzwReset').click();search(first.name);const exact=[...w.document.querySelectorAll('#wikiGrid [data-wiki]')].find(e=>e.dataset.wiki===first.id);assert.ok(exact);exact.click();assert.ok($('kyaraProfileOverlay').classList.contains('open'),'Native Wiki cards use the real existing character viewer');
  assert.equal(network.length,0,'Public Wiki navigation does not crawl AniList');
  assert.deepEqual(errors,[]);
  const css=await transform(await fs.readFile('dist/kizuna-wiki-v2.css','utf8'),{loader:'css'});assert.equal(css.warnings.length,0);
  console.log(JSON.stringify({catalogue:'sixty initial cards, progressive paging and focus',filters:'exact universe, rarity, owned, missing, duplicates, wishlist',search:'accent-insensitive and Japanese',sorting:'name, stored popularity and rarity',states:'empty/reset, account loading and isolation',navigation:'real character viewer',noEconomyMutation:true,noAniListRequests:true,css:'valid',errors:0}));
}finally{dom.window.close();}
