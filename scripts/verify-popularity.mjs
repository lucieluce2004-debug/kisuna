import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';

// The retained snapshot is the only popularity source used in this suite.
// Network requests and database mutations are deliberately unavailable.
const html=await fs.readFile('dist/index.html','utf8');
const seed=JSON.parse(await fs.readFile('seed/catalogue.json','utf8'));
const popularity=JSON.parse(await fs.readFile('seed/popularity.json','utf8'));
const policySource=await fs.readFile('dist/kizuna-rarity.js','utf8');
const scope={};vm.runInNewContext(policySource,scope);const policy=scope.KizunaRarity;
const ordinarySource='999999999';
for(const [fav,rarity]of [[0,'Commun'],[999,'Commun'],[1000,'Peu commune'],[2499,'Peu commune'],[2500,'Rare'],[6999,'Rare'],[7000,'Rare'],[9999,'Rare'],[10000,'Rare'],[15000,'Rare'],[1000000000,'Rare']]){
  assert.equal(policy.rarityFromPopularity(fav,ordinarySource),rarity,'Threshold boundary '+fav);
}
for(const input of [undefined,null,NaN,Infinity,-1,{},[],true,'not-a-number'])assert.equal(policy.favouriteCount(input),0,'Invalid favourites are not promoted');
assert.equal(policy.favouriteCount('8000'),8000);assert.equal(policy.favouriteCount(3000.9),3000);assert.equal(policy.favouriteCount(1e12),1000000000);
assert.equal(policy.rarityFromPopularity(0,53901),'Mythique');assert.equal(policy.rarityFromPopularity(0,'53901'),'Mythique');assert.equal(policy.rarityFromPopularity(0,539010),'Commun');
assert.equal(policy.popularitySnapshotAt,popularity.retrievedAt);
for(const [sourceId,fav]of Object.entries(popularity.bySourceId))assert.equal(policy.retainedPopularity[sourceId],fav,'The original real popularity snapshot must be retained');
assert.equal(Object.keys(popularity.bySourceId).length,234);assert.equal(seed.filter(row=>row.id.startsWith('cseed-')).length,235,'All original canonical identities remain present');
assert.ok(Array.isArray(policy.retainedMythicSources));assert.ok(Array.isArray(policy.retainedExtraCards));
const rankedSeed=policy.rankAlbumMythics(seed.map(row=>row.card));
for(const tier of ['mythicSources','legendarySources','epicSources'])assert.deepEqual([...rankedSeed[tier]].sort(),Array.from(policy.retainedRarityContext[tier]).sort(),'The browser context must use the full retained '+tier+' album ranking');
assert.equal(rankedSeed.insufficientAlbums.length,0,'Every retained visible album needs at least two real, distinct characters');
for(const album of rankedSeed.albums){assert.equal(album.mythicSources.length,Math.min(5,album.distinctCharacters));assert.equal(new Set(album.mythicSources).size,album.mythicSources.length);}
const sourceCount=new Set(seed.map(row=>String(row.card.sourceId))).size;
assert.equal(Object.keys(policy.retainedPopularity).length,sourceCount);
const distribution=Object.fromEntries(['Mythique','Légendaire','Épique','Rare','Peu commune','Commun'].map(tier=>[tier,0]));
for(const row of seed){
  const card=row.card,source=String(card.sourceId);
  assert.ok(Object.hasOwn(policy.retainedPopularity,source),'Retained source '+source+' must have an actual popularity value');
  assert.equal(card.fav,policy.retainedPopularity[source],card.name+' must use retained favourites');
  assert.equal(card.rarity,policy.rarityFromPopularity(card.fav,source,policy.retainedRarityContext),card.name+' must use the shared album policy');
  assert.equal(card.rarity_policy,'album-ranks-v2');distribution[card.rarity]++;
}
assert.equal(Object.values(distribution).reduce((sum,count)=>sum+count,0),seed.length);
assert.ok(Object.values(distribution).every(count=>count>0),'All six real card rarities must remain available for the unchanged booster odds');
const madara=seed.find(row=>String(row.card.sourceId)==='53901')?.card;assert.ok(madara);assert.equal(madara.rarity,'Mythique');assert.equal(policy.rarityFromPopularity(madara.fav,ordinarySource,[]),'Rare','Madara remains an explicit source-ID exception');
const declaredWeights=vm.runInNewContext(html.match(/const rarityData=(\[[\s\S]*?\]);/)[1]);
assert.deepEqual(Object.fromEntries(Array.from(declaredWeights,tier=>[tier.name,tier.weight])),{'Mythique':0.1,'Légendaire':0.2,'Épique':4.2,'Rare':12.5,'Peu commune':23,'Commun':60});
assert.deepEqual(JSON.parse(html.match(/const BOOSTER_SLOT_MINS=(\[[^;]+\]);/)[1]),[1,1,1,2,3]);assert.match(html,/PITY_M=250,PITY_L=50/);

async function harness(storage={}){
  const errors=[],requests=[],consoleBridge=new VirtualConsole();
  consoleBridge.on('error',(...values)=>errors.push(values.map(String).join(' ')));
  consoleBridge.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.message);});
  const dom=new JSDOM(html,{url:'https://kizuna.example.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:consoleBridge});
  const w=dom.window;w.scrollTo=()=>{};w.AbortSignal=AbortSignal;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.fetch=async value=>{requests.push(String(value));throw new Error('Unexpected network request');};
  for(const [key,value]of Object.entries(storage))w.localStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value));
  for(const script of w.document.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await new Promise(resolve=>setTimeout(resolve,35));
  return {dom,w,errors,requests,close(){dom.window.close();}};
}
function checkRetained(cards){
  assert.equal(cards.length,seed.length);const byId=new Map(cards.map(card=>[String(card.id),card]));
  for(const row of seed){const actual=byId.get(row.id);assert.ok(actual,'Retained identity '+row.id+' was lost');for(const key of ['name','series','sourceId','fav','rarity','pow','aura'])assert.equal(actual[key],row.card[key],row.card.name+' field '+key);}
}
const fresh=await harness();
try{
  checkRetained(fresh.w.KizunaGame.getSnapshot().cards);assert.equal(fresh.requests.length,0);assert.deepEqual(fresh.errors,[]);
  fresh.w.KizunaGame.showAlbums();
  const albums=[...fresh.w.document.querySelectorAll('.col-album')];assert.ok(albums.length>0,'The existing Albums layout remains populated');assert.ok(albums.some(album=>album.querySelector('h3').textContent==='Naruto'));
  const preview=fresh.w.document.querySelector('.col-album .th img');assert.ok(preview);assert.ok(preview.classList.contains('no'),'An unowned album preview keeps the original missing-card class');
  const previewCard=fresh.w.KizunaGame.getSnapshot().cards.find(card=>card.name===preview.alt&&card.image===preview.getAttribute('src'));assert.ok(previewCard);
  fresh.w.KizunaGame.applySnapshot({owned:[{id:previewCard.id,at:1700000000000}],chakra:500});fresh.w.KizunaGame.showAlbums();
  const ownedPreview=[...fresh.w.document.querySelectorAll('.col-album .th img')].find(image=>image.alt===previewCard.name&&image.getAttribute('src')===previewCard.image);assert.ok(ownedPreview);assert.equal(ownedPreview.classList.contains('no'),false,'Obtaining a card still removes the original missing-card class');
  // Lot 2 album thumbnails use the established Kizuna identity palette.
  assert.equal(ownedPreview.style.getPropertyValue('--c'),{'Mythique':'#f0a4cb','Légendaire':'#ecd08d','Épique':'#bc99f8','Rare':'#8bb8f5','Peu commune':'#81d4a7','Commun':'#c1c6d4'}[previewCard.rarity]);
}finally{fresh.close();}

const at=1700000000123,secondAt=1700000000456;
const staleRows=seed.map((row,index)=>{const card=row.card;return [card.id.slice(1),card.name,card.series,card.image,97000-index,'',card.g,card.cats.join(',')];});
const cached=await harness({
  hoshi_anilist_v2:{rows:staleRows,version:2,source:'legacy-random-favourites',t:Date.now()},
  hoshi_owned_cards_v2:[{id:madara.id,at,rarity:'Légendaire',level:5},{id:madara.id,at:secondAt,rarity:'Légendaire',level:5}],
  hoshi_gross_tirages_v2:[{id:madara.id,at,name:madara.name,series:madara.series,rarity:'Légendaire',level:5,username:'Joueur conservé',pullId:'preserved-pull'}],
  hoshi_display_name_v1:'Joueur conservé',hoshi_chakra_v2:'1234'
});
try{
  const game=cached.w.KizunaGame;let snapshot=game.getSnapshot();checkRetained(snapshot.cards);
  assert.equal(snapshot.owned.length,2);assert.deepEqual(Array.from(snapshot.owned,copy=>({id:copy.id,at:copy.at,rarity:copy.rarity,level:copy.level})),[{id:madara.id,at,rarity:'Mythique',level:6},{id:madara.id,at:secondAt,rarity:'Mythique',level:6}]);
  assert.equal(snapshot.pulls[0].pullId,'preserved-pull');assert.equal(snapshot.pulls[0].at,at);assert.equal(snapshot.pulls[0].rarity,'Mythique');assert.equal(snapshot.chakra,1234);assert.equal(snapshot.username,'Joueur conservé');
  const freshKnown=seed.find(row=>row.card.rarity!=='Mythique'&&String(row.card.sourceId)!=='53901').card,ownedBeforeFresh=Array.from(snapshot.owned,copy=>({id:copy.id,at:copy.at}));
  assert.equal(game.addCatalogueCards([{...freshKnown,fav:999999}]),0);
  const updatedKnown=game.getSnapshot().cards.find(card=>card.id===freshKnown.id);assert.equal(updatedKnown.fav,999999,'Fresh canonical database favourites take priority over the bundled fallback snapshot');assert.equal(updatedKnown.rarity,'Mythique','An existing retained character can enter the album top five on a metadata refresh');assert.equal(game.getSnapshot().cards.length,seed.length);assert.deepEqual(Array.from(game.getSnapshot().owned,copy=>({id:copy.id,at:copy.at})),ownedBeforeFresh);
  const fixture={id:'c987654321',sourceId:'987654321',name:'Metadata refresh fixture',series:'Test',image:'https://s4.anilist.co/character/fixture.jpg',fav:10000,g:'M',cats:['shonen']};
  const leaders=Array.from({length:5},(_,index)=>({...fixture,id:'c'+(987654322+index),sourceId:String(987654322+index),name:'Higher-ranked fixture '+index,fav:20000+index}));
  assert.equal(game.addCatalogueCards([fixture,...leaders]),6);assert.equal(game.getSnapshot().cards.find(card=>card.id===fixture.id).rarity,'Légendaire');
  game.applySnapshot({...snapshot,owned:[...snapshot.owned,{id:fixture.id,at:at+1000},{id:fixture.id,at:secondAt+1000}]});
  const before=game.getSnapshot(),identities=Array.from(before.owned,copy=>({id:copy.id,at:copy.at}));let notifications=0;const stop=game.subscribe(()=>notifications++);
  assert.equal(game.addCatalogueCards([{...fixture,fav:999999}]),0,'Refreshing existing metadata must not add another catalogue card');
  snapshot=game.getSnapshot();const refreshed=snapshot.cards.find(card=>card.id===fixture.id);assert.equal(refreshed.fav,999999);assert.equal(refreshed.rarity,'Mythique');assert.ok(refreshed.pow>=96&&refreshed.pow<=99);assert.deepEqual(Array.from(snapshot.owned,copy=>({id:copy.id,at:copy.at})),identities);assert.equal(snapshot.owned.filter(copy=>copy.id===fixture.id).length,2);assert.ok(snapshot.owned.filter(copy=>copy.id===fixture.id).every(copy=>copy.rarity==='Mythique'&&copy.level===6));assert.equal(snapshot.chakra,before.chakra);assert.ok(notifications>0,'Metadata-only updates notify the views even when no card is inserted');stop();
  assert.equal(cached.requests.length,0);assert.deepEqual(cached.errors,[]);
}finally{cached.close();}
const homonyms=[987649998,987649999].map(source=>[source,'Homonyme','Identity test','https://s4.anilist.co/character/homonym-test.jpg',100,'','M','shonen']);
const homonymCache=await harness({hoshi_anilist_v2:{rows:[...staleRows,...homonyms],version:2}});
try{
  const cards=homonymCache.w.KizunaGame.getSnapshot().cards;
  assert.equal(cards.length,seed.length+2,'Two distinct AniList sources sharing a full name must survive cache boot');
  for(const [source]of homonyms)assert.ok(cards.some(card=>card.id==='c'+source&&String(card.sourceId)===String(source)));
  assert.deepEqual(homonymCache.errors,[]);assert.equal(homonymCache.requests.length,0);
}finally{homonymCache.close();}
// Legacy personal catalogue records contain identity metadata, not rank bands.
// Both browser-cache boot and cloud snapshot restoration must classify the
// entire restored album before owned copies are normalized.
const restoredCatalogue=Array.from({length:18},(_,index)=>({
  id:'c'+(987650000+index),sourceId:String(987650000+index),name:'Restored character '+index,
  series:'Restored album',image:'https://s4.anilist.co/character/restore-test.jpg',
  fav:index===17?500:index===16?1500:30000-index*1000,g:'M',cats:['shonen']
}));
const restoredCache=await harness({kizuna_extra_catalogue_v1:restoredCatalogue});
try{
  const game=restoredCache.w.KizunaGame;
  const expected=[[0,'Mythique'],[5,'Légendaire'],[10,'Épique'],[15,'Rare'],[16,'Peu commune'],[17,'Commun']];
  const checkBands=snapshot=>{for(const [index,rarity]of expected)assert.equal(snapshot.cards.find(card=>card.id===restoredCatalogue[index].id)?.rarity,rarity,'Restored catalogue rank '+(index+1));};
  checkBands(game.getSnapshot());
  const copyTime=1700000000789;
  const snapshot=game.applySnapshot({catalogue:restoredCatalogue,owned:[{id:restoredCatalogue[5].id,at:copyTime},{id:restoredCatalogue[10].id,at:copyTime+1}],chakra:321});
  checkBands(snapshot);
  assert.deepEqual(Array.from(snapshot.owned,copy=>({id:copy.id,at:copy.at,rarity:copy.rarity})),[
    {id:restoredCatalogue[5].id,at:copyTime,rarity:'Légendaire'},
    {id:restoredCatalogue[10].id,at:copyTime+1,rarity:'Épique'}
  ]);
  assert.equal(snapshot.chakra,321);assert.equal(snapshot.owned.length,2);
  checkRetained(game.applySnapshot({catalogue:[],owned:[]}).cards);
  assert.equal(restoredCache.requests.length,0);assert.deepEqual(restoredCache.errors,[]);
}finally{restoredCache.close();}
console.log(JSON.stringify({retainedCards:seed.length,actualPopularitySources:sourceCount,distribution,thresholdBoundaries:'ordinary tiers passed',albumRankBands:'Mythic1–5 / Legendary6–10 / Epic11–15',minimumTwoRealCharacters:'passed',madaraSourceException:'Mythique',legacyRandomFavouriteCache:'replaced by retained snapshot',ownedIdentityQuantityAndTimes:'preserved',metadataOnlyRefresh:'reranks albums and notifies views',cacheAndCloudRestoration:'all bands preserved before owned copies',boosterWeightsAndGuarantees:'unchanged',existingAlbumsAndMissingClasses:'preserved',network:'none'}));
