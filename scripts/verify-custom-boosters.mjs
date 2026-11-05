import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';

// Run the shipped page and its real draw/reveal functions against in-memory
// published definitions. Nothing below connects to Auth, AniList or a database.
const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
assert.match(html,/const INFINITE_BOOSTERS=false;/,'Roll rewards must be spendable, not hidden by infinite test openings');
const errors=[],requests=[];
const virtualConsole=new VirtualConsole();
virtualConsole.on('error',(...args)=>errors.push(args.map(String).join(' ')));
virtualConsole.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.message);});
const dom=new JSDOM(html,{url:'https://kizuna.aleklecaribou.chatgpt.site/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
const w=dom.window;
w.scrollTo=()=>{};
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
w.fetch=async(url)=>{requests.push(String(url));throw new Error('Unexpected network request '+url);};
w.AbortSignal=AbortSignal;
const until=async predicate=>{const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw new Error('Custom booster reveal did not advance');await new Promise(resolve=>setTimeout(resolve,20));}};
try{
  for(const script of w.document.scripts){
    const filename=script.getAttribute('src');
    let code=filename?await fs.readFile(path.join('dist',filename),'utf8'):script.textContent;
    if(!filename&&code.includes('window.KizunaGame={'))code=code.replace('window.KizunaGame={','window.__customBoosterQA={openBoosterNow};window.KizunaGame={');
    new vm.Script(code,{filename:filename||'inline-game.js'});w.eval(code);
    if(filename==='kizuna-config.js')w.KIZUNA_CONFIG=Object.freeze({});
  }
  await new Promise(resolve=>setTimeout(resolve,40));
  const game=w.KizunaGame;
  assert.ok(game&&w.__customBoosterQA);
  assert.deepEqual(errors,[]);
  const cards=game.getSnapshot().cards;
  const tiers=['Rare','Épique','Légendaire','Mythique'];
  const selected=tiers.map(tier=>cards.find(card=>card.rarity===tier));
  assert.ok(selected.every(Boolean),'Retained catalogue fixtures must include every required rarity');
  const cardIds=selected.map(card=>String(card.id)),pool=new Set(cardIds);
  assert.ok(cards.some(card=>!pool.has(card.id)),'The test pool must exclude real catalogue cards');
  const id='11111111-1111-4111-8111-111111111111',runtimeId='staff:'+id;
  const definition={id,name:'Liens du crépuscule',description:'Une sélection de quatre personnages.',published:true,card_ids:cardIds,card_count:5};
  const pack=()=>w.document.querySelector('#kGrid [data-id="'+runtimeId+'"]');
  const baseCount=w.document.querySelectorAll('#kGrid .kpack').length;
  assert.equal(game.setBoosterDefinitions([definition]),1);
  assert.equal(w.document.querySelectorAll('#kGrid .kpack').length,baseCount+1);
  assert.equal(pack().querySelector('.kp-title').textContent,definition.name);
  assert.ok(pack().querySelector('.booster-logo'),'A custom pack must have usable artwork');
  const invalid=[
    {...definition,id:'22222222-2222-4222-8222-222222222222',published:false},
    {...definition,id:'not-a-uuid'},
    {...definition,id:'33333333-3333-4333-8333-333333333333',card_ids:[...cardIds,'c-does-not-exist']},
    {...definition,id:'44444444-4444-4444-8444-444444444444',card_ids:cardIds.slice(0,3)},
    {...definition,id:'55555555-5555-4555-8555-555555555555',name:''},
  ];
  assert.equal(game.setBoosterDefinitions([definition,...invalid]),1,'Drafts, unknown cards and incomplete rarity pools cannot become playable packs');
  assert.equal(w.document.querySelectorAll('#kGrid .kpack').length,baseCount+1);
  const markup={...definition,name:'<b id="unsafe-pack">Liens</b>',description:'<i id="unsafe-description">Texte</i>'};
  assert.equal(game.setBoosterDefinitions([markup]),1);
  assert.equal(pack().querySelector('.kp-title').textContent,markup.name,'Custom names must render as text');
  assert.equal(w.document.querySelector('#unsafe-pack'),null);
  assert.equal(w.document.querySelector('#unsafe-description'),null);
  game.setBoosterDefinitions([definition]);
  w.Math.random=()=>.999999;

  async function open({free=0,inv=1,pm=0,pl=0}={}){
    game.applySnapshot({owned:[],pulls:[],username:'Test',chakra:500,stock:{free,inv,pm,pl,t:Date.now(),day:''}});
    pack().click();
    assert.equal(w.document.querySelector('#kTitle').textContent,definition.name);
    await w.__customBoosterQA.openBoosterNow(1);
    const snapshot=game.getSnapshot();
    assert.equal(snapshot.owned.length,5);
    assert.ok(snapshot.owned.every(copy=>pool.has(String(copy.id))),'Actual draws must never fall back outside the assembled card pool');
    const sequence=[];
    for(let position=1;position<=5;position++){
      await until(()=>Number(w.document.querySelector('#kyaraRevealRoot [role="progressbar"]')?.getAttribute('aria-valuenow'))===position);
      sequence.push(w.document.querySelector('.kr-current-card .tcard').dataset.r);
      if(position<5)w.document.querySelector('#kyaraRevealRoot [data-kr-action="advance"]').click();
    }
    const levels={C:1,U:2,R:3,E:4,L:5,M:6};
    assert.deepEqual(sequence.map(letter=>levels[letter]),sequence.map(letter=>levels[letter]).sort((a,b)=>a-b),'Visible cards must be revealed from least to most rare');
    return {snapshot,sequence};
  }
  const free=await open({free:1,inv:2});
  assert.equal(free.snapshot.stock.free,0);assert.equal(free.snapshot.stock.inv,2,'Opening uses exactly one free booster first');assert.deepEqual(free.sequence,['R','R','R','R','R']);
  const legendary=await open({pl:49});
  assert.deepEqual(legendary.sequence,['R','R','R','R','L']);assert.equal(legendary.snapshot.stock.pl,0);assert.equal(legendary.snapshot.stock.inv,0,'A stock roll is consumed when free stock is empty');
  const mythic=await open({pm:249,pl:49});
  assert.deepEqual(mythic.sequence,['R','R','R','R','M']);assert.equal(mythic.snapshot.stock.pm,0);assert.equal(mythic.snapshot.stock.pl,0,'A mythic also satisfies the legendary guarantee');
  game.applySnapshot({owned:[],pulls:[],username:'Test',chakra:500,stock:{free:0,inv:0,pm:0,pl:0,t:Date.now(),day:''}});
  await w.__customBoosterQA.openBoosterNow(1);
  assert.equal(game.getSnapshot().owned.length,0);assert.equal(game.getSnapshot().stock.inv,0);assert.ok(w.document.querySelector('#kOpen1').disabled,'Empty stock cannot produce cards');
  assert.equal(game.setBoosterDefinitions([{...definition,published:false}]),0);
  assert.equal(pack(),null,'Unpublishing removes the playable pack');
  assert.equal(w.document.querySelector('#kGrid .kpack.sel').dataset.id,'mix','Removing a selected edition must return selection to a valid pack');
  assert.equal(w.document.querySelectorAll('#kGrid .kpack').length,baseCount);
  assert.equal(requests.length,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({publishedDefinitions:'passed',draftAndInvalidRejected:'passed',textOnlyNames:'passed',actualPoolIsolation:'passed',openingCards:5,revealAscending:'passed',legendaryAndMythicGuarantees:'passed',freeAndRollConsumption:'passed',emptyStockDenied:'passed',unpublishRemovesPack:'passed',network:'none',applicationErrors:0}));
}finally{w.close();}
