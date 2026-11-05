import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';

// Execute the shared production policy directly. These fixtures contain no
// network response, database write or fabricated companion character.
const source=await fs.readFile('supabase/functions/_shared/rarity-policy.ts','utf8');
const compiled=await transform(source,{loader:'ts',format:'cjs',target:'es2022'});
const module={exports:{}};vm.runInNewContext(compiled.code,{module,exports:module.exports});
const {rankAlbumMythics,rarityFromPopularity,FAVOURITE_THRESHOLDS}=module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const card=(id,sourceId,series,fav)=>({id,sourceId,series,fav});
const alpha=[card('a2','2','Alpha',20000),card('a10','10','Alpha',20000),card('a3','3','Alpha',19000),card('a4','4','Alpha',18000),card('a5','5','Alpha',17000),card('a6','6','Alpha',16000),card('a7','7','Alpha',15000),card('a2-edition','0002','Alpha',19000),card('madara','53901','Alpha',4855)];
const beta=[card('b100','100','Beta',10),card('b101','101','BETA',20)];
const sparse=[card('solo-first','200','Sparse',30),card('solo-edition','200','Sparse',30)];
const cards=Object.freeze([...alpha,...beta,...sparse].map(value=>Object.freeze(value))),before=JSON.stringify(cards);
const ranked=rankAlbumMythics(cards),group=ranked.albums.find(album=>album.name.toLowerCase()==='alpha');
assert.deepEqual(plain(group.mythicSources),['2','10','3','4','5'],'Favourite ties use numeric source-ID ascending order, independent of editions');
assert.equal(group.distinctCharacters,8,'A second edition must not count as another character');assert.equal(group.cardIds.length,9);
assert.equal(rarityFromPopularity(15000,'7',ranked),'Légendaire','Sixth to tenth place uses the album ranking');
assert.equal(rarityFromPopularity(15000,'7',ranked.mythicSources),'Rare','A legacy Mythique-only set does not invent a lower rarity band');
assert.equal(rarityFromPopularity(1000000000,'999999999'),'Rare','Without an album ranking the ordinary ceiling is Rare');
assert.equal(rarityFromPopularity(1,'2',ranked.mythicSources),'Mythique');assert.equal(rarityFromPopularity(1,'2',[...ranked.mythicSources]),'Mythique','Browser arrays and server sets use the same context');
assert.equal(rarityFromPopularity(4855,'53901',ranked.mythicSources),'Mythique','The explicit Madara exception remains active outside the top five');
assert.equal(group.mythicSources.includes('53901'),false);assert.equal(ranked.mythicSources.has('53901'),true);
assert.equal(group.legendarySources.includes('53901'),true,'Per-album bands retain their raw rank membership');assert.equal(ranked.legendarySources.has('53901'),false,'The Madara exception takes priority in the canonical sets');
const betaGroup=ranked.albums.find(album=>album.name.toLowerCase()==='beta');assert.equal(betaGroup.distinctCharacters,2);assert.deepEqual(plain(betaGroup.mythicSources),['101','100']);assert.equal(betaGroup.needsMoreCards,false,'A two-character album makes both real characters Mythic');
const soloGroup=ranked.albums.find(album=>album.name.toLowerCase()==='sparse');assert.equal(soloGroup.distinctCharacters,1);assert.equal(soloGroup.needsMoreCards,true);assert.equal(ranked.insufficientAlbums.some(album=>album.id===soloGroup.id),true);assert.deepEqual(plain(soloGroup.sourceIds),['200'],'A sparse album is flagged without inventing a second character');
assert.equal(JSON.stringify(cards),before,'Ranking must not mutate cards, counts or ordering');

const managed=Object.freeze([{id:'managed-alpha',name:' aLpHa ',card_ids:Object.freeze(['a6','a7','a7','missing'])},{id:'managed-empty',name:'Empty',card_ids:Object.freeze([])},{id:'managed-sparse',name:'SPARSE',card_ids:Object.freeze(['solo-first','solo-edition'])}].map(value=>Object.freeze(value)));
const managedBefore=JSON.stringify(managed),overridden=rankAlbumMythics(cards,managed),managedAlpha=overridden.albums.find(album=>album.id==='managed-alpha');
assert.equal(overridden.albums.filter(album=>album.name.toLowerCase()==='alpha').length,1,'A managed case variant replaces the implicit series album');assert.equal(managedAlpha.managed,true);assert.deepEqual(plain(managedAlpha.cardIds),['a6','a7']);assert.deepEqual(plain(managedAlpha.mythicSources),['6','7']);assert.equal(overridden.mythicSources.has('2'),false,'Cards excluded by the managed membership are not ranked through a hidden implicit album');
assert.equal(overridden.insufficientAlbums.find(album=>album.id==='managed-empty').distinctCharacters,0);assert.equal(overridden.insufficientAlbums.find(album=>album.id==='managed-sparse').distinctCharacters,1);assert.equal(JSON.stringify(managed),managedBefore);
const normalized=result=>({mythicSources:[...result.mythicSources].sort((a,b)=>Number(a)-Number(b)),legendarySources:[...result.legendarySources].sort((a,b)=>Number(a)-Number(b)),epicSources:[...result.epicSources].sort((a,b)=>Number(a)-Number(b)),albums:plain(result.albums)});
assert.deepEqual(normalized(rankAlbumMythics([...cards].reverse(),[...managed].reverse())),normalized(overridden),'Input order must not change the classification');

const overlap=rankAlbumMythics(cards,[{id:'cross',name:'Cross',card_ids:['a6','b100']}]);
assert.equal(overlap.albums.find(album=>album.name==='Alpha').mythicSources.includes('6'),false);assert.equal(overlap.mythicSources.has('6'),true,'One canonical rarity uses the union of album selections');
const changed=cards.map(value=>value.sourceId==='7'?{...value,fav:999999}:value),reranked=rankAlbumMythics(changed);
assert.equal(reranked.albums.find(album=>album.name==='Alpha').mythicSources[0],'7');assert.equal(reranked.mythicSources.has('5'),false);assert.equal(rarityFromPopularity(17000,'5',reranked),'Légendaire','A displaced character enters the next ranked band');

const large=Array.from({length:18},(_,index)=>card('large-'+(300+index),String(300+index),'Large',index<15?100000-index:index===15?5000:index===16?1000:999));
large.push(card('large-alias-305','0305','Large',1000),card('large-alias-310','0310','Large',1000));
const largeBefore=JSON.stringify(large),bands=rankAlbumMythics(large),largeAlbum=bands.albums[0];
assert.equal(largeAlbum.distinctCharacters,18);assert.equal(largeAlbum.cardIds.length,20);
assert.deepEqual(plain(largeAlbum.mythicSources),['300','301','302','303','304']);assert.deepEqual(plain(largeAlbum.legendarySources),['305','306','307','308','309']);assert.deepEqual(plain(largeAlbum.epicSources),['310','311','312','313','314']);
const serialContext={mythicSources:[...bands.mythicSources],legendarySources:[...bands.legendarySources],epicSources:[...bands.epicSources]};
for(const [rank,expected]of [[1,'Mythique'],[5,'Mythique'],[6,'Légendaire'],[10,'Légendaire'],[11,'Épique'],[15,'Épique'],[16,'Rare'],[17,'Peu commune'],[18,'Commun']]){
  const row=large[rank-1];assert.equal(rarityFromPopularity(row.fav,row.sourceId,bands),expected,'Set context rank '+rank);assert.equal(rarityFromPopularity(row.fav,row.sourceId,serialContext),expected,'Serialized array context rank '+rank);
}
assert.equal(Object.hasOwn(FAVOURITE_THRESHOLDS,'Légendaire'),false);assert.equal(Object.hasOwn(FAVOURITE_THRESHOLDS,'Épique'),false);
for(const [fav,expected]of [[0,'Commun'],[999,'Commun'],[1000,'Peu commune'],[2499,'Peu commune'],[2500,'Rare'],[7000,'Rare'],[10000,'Rare'],[15000,'Rare']])assert.equal(rarityFromPopularity(fav,'999999999'),expected);
const ties=Array.from({length:16},(_,index)=>card('tie-'+(index+1),String(index+1),'Ties',10000));ties.push(card('tie-alias','0006','Ties',10000));
const tied=rankAlbumMythics(ties).albums[0];assert.deepEqual(plain(tied.mythicSources),['1','2','3','4','5']);assert.deepEqual(plain(tied.legendarySources),['6','7','8','9','10']);assert.deepEqual(plain(tied.epicSources),['11','12','13','14','15']);assert.equal(tied.distinctCharacters,16);

const managedLarge=rankAlbumMythics(large,[{id:'managed-large',name:' LARGE ',card_ids:large.filter(row=>Number(row.sourceId)>=302).map(row=>row.id)}]);
assert.equal(managedLarge.albums.length,1);assert.deepEqual(plain(managedLarge.albums[0].mythicSources),['302','303','304','305','306']);assert.deepEqual(plain(managedLarge.albums[0].legendarySources),['307','308','309','310','311']);assert.deepEqual(plain(managedLarge.albums[0].epicSources),['312','313','314','315','316']);assert.equal(rarityFromPopularity(100000,'300',managedLarge),'Rare','Managed membership suppresses all hidden implicit rarity bands');
const multiAlbum=rankAlbumMythics(large,[{id:'cross-m',name:'Cross Mythic',card_ids:['large-305','large-317']},{id:'cross-l',name:'Cross Legendary',card_ids:['large-300','large-301','large-302','large-303','large-304','large-310']}]);
assert.equal(multiAlbum.mythicSources.has('305'),true);assert.equal(multiAlbum.legendarySources.has('305'),false);assert.equal(rarityFromPopularity(0,'305',multiAlbum),'Mythique');assert.equal(multiAlbum.legendarySources.has('310'),true);assert.equal(multiAlbum.epicSources.has('310'),false);assert.equal(rarityFromPopularity(0,'310',multiAlbum),'Légendaire');
assert.equal(rarityFromPopularity(0,'priority',{mythicSources:['priority'],legendarySources:['priority'],epicSources:['priority']}),'Commun','Invalid source identities cannot enter a ranked band');
assert.equal(rarityFromPopularity(0,'2',{mythicSources:['2'],legendarySources:['2'],epicSources:['2']}),'Mythique');assert.equal(rarityFromPopularity(0,'2',{legendarySources:['2'],epicSources:['2']}),'Légendaire');assert.equal(rarityFromPopularity(0,'2',{epicSources:['2']}),'Épique');
assert.equal(JSON.stringify(large),largeBefore);assert.deepEqual(normalized(rankAlbumMythics([...large].reverse())),normalized(bands),'All three band sets remain deterministic under input reversal');

const invalid=rankAlbumMythics([card('bad','not-an-id','Invalid',999999),card('none',null,'Invalid',999999)], [{id:'invalid',name:'Invalid',card_ids:['bad','none','unknown']}]);
assert.equal(invalid.mythicSources.size,0);assert.equal(invalid.legendarySources.size,0);assert.equal(invalid.epicSources.size,0);assert.equal(invalid.insufficientAlbums[0].distinctCharacters,0);assert.deepEqual(plain(invalid.insufficientAlbums[0].cardIds),[],'Missing or malformed sources cannot satisfy the two-character requirement');
assert.equal(rankAlbumMythics([]).albums.length,0);
console.log(JSON.stringify({rankBands:'1–5 Mythic / 6–10 Legendary / 11–15 Epic',rankBoundaries:'5/6,10/11,15/16 passed',numericTieBreak:'passed',duplicateEditions:'count once',twoRealCharacters:'both Mythic',sparseAlbums:'flagged without fabrication',managedOverridesImplicit:'all bands case-insensitive',canonicalPriority:'Mythic > Legendary > Epic',metadataReranking:'passed',madaraException:'preserved',ordinaryFavouriteCeiling:'Rare',legacyMythicSetAndArray:'supported',serializedContext:'passed',immutableInputs:'passed',deterministicInputOrder:'passed',missingSources:'excluded',network:'none'}));
