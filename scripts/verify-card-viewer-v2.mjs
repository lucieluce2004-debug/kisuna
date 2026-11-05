import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {transform} from 'esbuild';

// Exercise the actual assembled page. During feature integration only, inject
// the exact feature sources in memory; no build artifact or account is changed.
let html=await fs.readFile('dist/index.html','utf8');
for(const [marker,file] of [['const kzwState=','wiki-view.inc.js'],['let kzViewerReturn=','card-viewer.inc.js']]){
  if(!html.includes(marker))html=html.replace('/* KIZUNA_GAME_BRIDGE_BEGIN */',(await fs.readFile('src/'+file,'utf8'))+'\n/* KIZUNA_GAME_BRIDGE_BEGIN */');
}
const errors=[],network=[],issues=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>{if(!/CSS stylesheet/.test(e.message))errors.push(e.message);});
vc.on('error',(...args)=>errors.push(args.map(String).join(' ')));
const dom=new JSDOM(html,{url:'https://kizuna.example.test/#encyclopedia',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,$=id=>w.document.getElementById(id),q=selector=>w.document.querySelector(selector);
w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.fetch=async url=>{network.push(String(url));throw new Error('No live network in card viewer test');};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
const flush=()=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
const key=(name,shiftKey=false)=>w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:name,shiftKey,bubbles:true,cancelable:true}));
const check=(condition,message)=>{if(!condition)issues.push(message);};
try{
  for(const script of w.document.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await flush();
  const game=w.KizunaGame,cards=Array.from(game.getSnapshot().cards),first=cards[0],second=cards[1];
  w.KizunaAccount.getSnapshot=()=>({user:{id:'viewer-player'},loading:false,status:'synced'});
  w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));
  const now=Date.now(),day=86400000;
  const owned=[{id:first.id,at:now-4*day},{id:first.id,at:now-3*day},{id:first.id,at:now-2*day},{id:second.id,at:now-day}];
  const listing={id:'viewer-reserved',cardId:first.id,seller:'Viewer QA',mode:'sale',status:'active',price:99999,createdAt:now,endsAt:now+day,reservedCopy:{id:first.id,at:now-5*day}};
  const seed=history=>({owned,username:'Viewer QA',chakra:900,stock:{free:31,inv:12,pm:18,pl:7,t:now,day:'keep'},market:{listings:[listing],history,credits:{},cards:[],wishlist:[]}});
  game.applySnapshot(seed([]));game.showTab('wiki');await flush();await settle();
  const openWikiCard=card=>{
    $('wikiSearch').value=card.name;$('wikiSearch').dispatchEvent(new w.Event('input',{bubbles:true}));
    const button=[...w.document.querySelectorAll('#wikiGrid [data-wiki]')].find(node=>node.dataset.wiki===card.id);
    assert.ok(button,'The actual Wiki exposes this card as a native button');button.focus();button.click();return button;
  };
  const opener=openWikiCard(first);await flush();
  assert.ok($('kyaraProfileOverlay').classList.contains('open'));assert.equal($('kyaraProfileOverlay').getAttribute('role'),'dialog');
  assert.equal($('cpTitle').textContent,first.name);assert.equal(w.document.activeElement,$('cpCloseFocus'));
  const profileLast=q('#kyaraProfileOverlay .cp-side [data-cp-action="boosters"]');assert.ok(profileLast);profileLast.focus();key('Tab');assert.equal(w.document.activeElement,$('cpCloseFocus'),'Tab wraps inside the character profile');key('Tab',true);assert.equal(w.document.activeElement,profileLast);
  assert.equal(q('.cp-market-panel svg'),null,'No chart is invented from the asking price');
  assert.deepEqual([...w.document.querySelectorAll('.cp-market-stats b')].map(node=>node.textContent),['—','—','0']);
  assert.match(q('.kz-price-empty').textContent,/Aucune vente/);
  assert.equal(w.document.querySelectorAll('[data-kz-profile-inspect]').length,1,'The async profile refresh keeps exactly one inspection button');
  const beforeInspect=JSON.stringify(game.getSnapshot()),inspect=q('[data-kz-profile-inspect]');inspect.focus();inspect.click();
  assert.ok($('detailBackdrop').classList.contains('open'));assert.ok($('kyaraProfileOverlay').classList.contains('open'));
  assert.equal($('detailBackdrop').getAttribute('role'),'dialog');assert.equal($('detailBackdrop').getAttribute('aria-modal'),'true');
  assert.equal(q('.ka-viewer-owned').textContent,'3 exemplaires disponibles','The dossier excludes the separately reserved copy from available stock');
  const facts=Object.fromEntries([...w.document.querySelectorAll('.ka-viewer-facts>div')].map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]));
  assert.equal(facts.Univers,first.series);assert.equal(facts['Rareté'],first.rarity);assert.equal(facts['Au marché'],'1 exemplaire réservé');
  assert.equal(facts['Première obtention disponible'],new Date(now-4*day).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}),'The dossier displays an actual retained copy date, not an invented unlock date');
  assert.equal(w.document.activeElement,$('viewerClose'));assert.equal(q('#cardViewer .ff').getAttribute('aria-hidden'),'false');assert.equal(q('#cardViewer .fb').getAttribute('aria-hidden'),'true');
  assert.ok([...w.document.querySelectorAll('#cardViewer .fb a')].every(link=>link.tabIndex===-1));
  $('kzViewerFlip').click();assert.ok(q('#cardViewer .fcard').classList.contains('flipped'));assert.equal($('kzViewerFlip').getAttribute('aria-pressed'),'true');assert.equal(q('#cardViewer .ff').getAttribute('aria-hidden'),'true');assert.equal(q('#cardViewer .fb').getAttribute('aria-hidden'),'false');
  assert.ok([...w.document.querySelectorAll('#cardViewer .fb a')].every(link=>link.tabIndex===0));
  $('kzViewerZoom').click();assert.ok($('cardViewer').classList.contains('kz-zoomed'));assert.equal($('kzViewerZoom').getAttribute('aria-pressed'),'true');
  const viewerLast=q('#detailContent [data-km-open]')||$('kzViewerZoom');viewerLast.focus();key('Tab');assert.equal(w.document.activeElement,$('viewerClose'),'Tab wraps inside the card viewer');
  key('Tab',true);assert.equal(w.document.activeElement,viewerLast,'Shift+Tab wraps inside the card viewer including Mythic action');
  $('viewerClose').click();assert.ok(!$('detailBackdrop').classList.contains('open'));assert.equal(w.document.activeElement,inspect);
  check(w.document.body.style.overflow==='hidden','Closing inspection must keep body scroll locked while the character profile remains open');
  inspect.click();key('Escape');
  check(!$('detailBackdrop').classList.contains('open'),'Escape must close the topmost card inspection dialog');
  check($('kyaraProfileOverlay').classList.contains('open'),'Escape from card inspection must leave the underlying character profile open');
  check(w.document.activeElement===inspect,'Escape must return focus to the character profile inspection button');
  // Recover from any topmost-dialog regression so price and inventory checks still run.
  if($('detailBackdrop').classList.contains('open'))$('viewerClose').click();
  assert.equal(JSON.stringify(game.getSnapshot()),beforeInspect,'Opening, flipping, zooming and closing a card never mutate the game');
  if($('kyaraProfileOverlay').classList.contains('open'))$('cpCloseFocus').click();
  await settle();
  check(w.document.activeElement===opener,'Closing the profile must restore the actual Wiki opener');

  openWikiCard(first);const related=q('#kyaraProfileOverlay [data-cp-related]');assert.ok(related);const relatedId=related.dataset.cpRelated;related.focus();related.click();await flush();
  assert.equal($('kyaraProfileOverlay').dataset.cardId,relatedId,'Rapid navigation to a related card retains the latest profile');
  assert.equal(q('[data-kz-profile-inspect]').dataset.kzProfileInspect,relatedId,'The inspection control always targets the currently displayed character');
  assert.equal(w.document.querySelectorAll('[data-kz-profile-inspect]').length,1);assert.equal($('cpTitle').textContent,cards.find(card=>card.id===relatedId).name);
  $('cpCloseFocus').click();await settle();
  if($('kyaraProfileOverlay').classList.contains('open')){$('cpCloseFocus').click();await settle();}

  const history=[
    {id:'sale-one',type:'buy',cardId:first.id,at:now-day,gross:100},
    {id:'sale-two',type:'auction',cardId:first.id,at:now-2*day,gross:300},
    {id:'sale-month',type:'buy-now',cardId:first.id,at:now-8*day,gross:500},
    {id:'expired-history',type:'buy',cardId:first.id,at:now-31*day,gross:900},
    {id:'not-a-sale',type:'trade',cardId:first.id,at:now-day,gross:77777},
    {id:'future-sale',type:'buy',cardId:first.id,at:now+120000,gross:88888},
    {id:'other-card',type:'buy',cardId:second.id,at:now-day,gross:55555},
    {id:'zero-sale',type:'buy',cardId:first.id,at:now-day,gross:0}
  ];
  game.applySnapshot(seed(history));game.showTab('wiki');await flush();await settle();openWikiCard(first);await flush();
  assert.deepEqual([...w.document.querySelectorAll('.cp-market-stats b')].map(node=>node.textContent),['200 ◆','300 ◆','3'],'Medians and sale count use dated completed sales of this card only');
  q('.cp-market-panel [data-ka-range="7"]').click();assert.equal(q('.cp-market-panel [data-ka-range="7"]').getAttribute('aria-pressed'),'true');assert.equal(w.document.querySelectorAll('.cp-market-panel svg circle').length,2);
  q('.cp-market-panel [data-ka-range="30"]').click();assert.equal(w.document.querySelectorAll('.cp-market-panel svg circle').length,3);
  $('cpCloseFocus').click();await settle();
  game.applySnapshot(seed(history.slice(0,1)));game.showTab('wiki');await flush();await settle();openWikiCard(first);await flush();assert.equal(q('.cp-market-panel svg'),null,'A single observed sale cannot produce an invented second graph point');assert.match(q('.kz-price-empty').textContent,/Une vente/);
  $('cpCloseFocus').click();await settle();

  game.applySnapshot(seed([]));game.showTab('col');await flush();await settle();
  let confirmations=0;w.confirm=message=>{confirmations++;assert.match(message,/Recycler 2 doublon/);assert.match(message,/irréversible/);return false;};
  const beforeRecycle=game.getSnapshot(),beforeCancelled=JSON.stringify(beforeRecycle);$('colRecycle').click();assert.equal(confirmations,1);assert.equal(JSON.stringify(game.getSnapshot()),beforeCancelled,'Cancelling recycling preserves all copies, Chakra and reservations');
  w.confirm=()=>{confirmations++;return true;};$('colRecycle').click();
  const afterRecycle=game.getSnapshot();assert.equal(confirmations,2);assert.equal(afterRecycle.owned.length,2);assert.equal(afterRecycle.owned.filter(copy=>copy.id===first.id).length,1);assert.equal(afterRecycle.owned.filter(copy=>copy.id===second.id).length,1);
  const values={'Commun':5,'Peu commune':8,'Rare':10,'Épique':15,'Légendaire':25,'Mythique':60};assert.equal(afterRecycle.chakra,beforeRecycle.chakra+2*values[first.rarity]);
  assert.equal(JSON.stringify(afterRecycle.market),JSON.stringify(beforeRecycle.market),'Recycling does not consume the reserved listing copy or change market records');
  assert.equal(afterRecycle.stock.free,beforeRecycle.stock.free);assert.equal(afterRecycle.stock.pm,beforeRecycle.stock.pm);assert.equal(afterRecycle.stock.pl,beforeRecycle.stock.pl);
  $('colRecycle').click();assert.equal(confirmations,2,'No confirmation or credit occurs when no available duplicates remain');assert.equal(JSON.stringify(game.getSnapshot()),JSON.stringify(afterRecycle));
  assert.equal(network.length,0,'Public profile inspection never calls AniList');assert.deepEqual(errors,[]);
  const css=await transform(await fs.readFile('dist/kizuna-viewer-v2.css','utf8'),{loader:'css'});assert.equal(css.warnings.length,0);
  assert.deepEqual(issues,[],'Nested dialog focus and scroll invariants');
  console.log(JSON.stringify({viewer:'real Wiki/profile entry, flip, zoom, native controls, keyboard loop',nestedDialogs:'Escape, focus restoration and scroll lock',market:'no fabricated prices or graph points; only completed dated sales',recycling:'confirmed available duplicates only; reservations untouched',noViewerMutation:true,noAniListRequests:true,css:'valid',errors:0}));
}finally{dom.window.close();}
