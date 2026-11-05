import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Historical command name retained for compatibility. This is now an audit:
// public GET requests and one JSON report only. It does not generate SQL or
// perform any mutation. Live rarity writes belong to the transactional album
// rebalancer in schema/kizuna_album_rarity_ranks.sql, never an absolute M threshold.
const checkout=fileURLToPath(new URL('../',import.meta.url));
const outputs=path.resolve(checkout,'..','..','outputs');
const reportFile=path.join(outputs,'kizuna-popularity-audit.json');
const configContext={window:{}};
vm.runInNewContext(await fs.readFile(path.join(checkout,'dist/kizuna-config.js'),'utf8'),configContext);
const config=configContext.window.KIZUNA_CONFIG;
assert.equal(new URL(config.supabaseUrl).origin,'https://hxbujmdzidtwmalmqrwt.supabase.co');
assert.ok(typeof config.supabaseKey==='string'&&config.supabaseKey.length>10);
const policyContext={};
vm.runInNewContext(await fs.readFile(path.join(checkout,'dist/kizuna-rarity.js'),'utf8'),policyContext);
const policy=policyContext.KizunaRarity;
assert.equal(typeof policy?.rankAlbumMythics,'function','Rebuild the current album policy before auditing');
assert.equal(typeof policy?.rarityFromPopularity,'function');
assert.equal(typeof policy?.favouriteCount,'function');
assert.equal(Object.hasOwn(policy.FAVOURITE_THRESHOLDS,'Mythique'),false,'Absolute Mythique thresholds are retired');
for(const tier of ['Légendaire','Épique'])assert.equal(Object.hasOwn(policy.FAVOURITE_THRESHOLDS,tier),false,'Absolute '+tier+' thresholds are retired');
const seed=JSON.parse(await fs.readFile(path.join(checkout,'seed/catalogue.json'),'utf8'));
const seedById=new Map(seed.map(row=>[row.id,row.card]));
const idPattern=/^(?:cseed-\d{4,8}|c[1-9]\d{0,9})$/;
const rarityNames=['Mythique','Légendaire','Épique','Rare','Peu commune','Commun'];
const tiers={Commun:[48,8,14],'Peu commune':[58,8,16],Rare:[72,9,26],'Épique':[84,10,30],'Légendaire':[90,7,30],Mythique:[96,4,25]};
const hash=value=>{let result=7;for(const character of value)result=(result*31+character.charCodeAt(0))>>>0;return result;};
async function publicRows(table,columns,order='id',filters={}){
  const rows=[];
  for(let offset=0;;offset+=1000){
    const endpoint=new URL('/rest/v1/'+table,config.supabaseUrl);
    endpoint.search=new URLSearchParams({select:columns,order,limit:'1000',offset:String(offset),...filters}).toString();
    const response=await fetch(endpoint,{method:'GET',headers:{apikey:config.supabaseKey,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200,'Public '+table+' request failed');
    const page=await response.json();assert.ok(Array.isArray(page)&&page.length<=1000,'Invalid public '+table+' response');rows.push(...page);
    if(page.length<1000)break;
    assert.ok(rows.length<1000000,'Audit pagination exceeded its safety bound');
  }
  return rows;
}
const [cards,albums,memberships,boosters]=await Promise.all([
  publicRows('kizuna_cards','id,source_id,card,created_at'),
  publicRows('kizuna_albums','id,name,anime_id'),
  publicRows('kizuna_album_cards','album_id,card_id','album_id,card_id'),
  publicRows('kizuna_boosters','id,name,card_ids,published','id',{published:'eq.true'}),
]);
assert.ok(cards.length>0,'An empty catalogue cannot be audited');
assert.equal(new Set(cards.map(row=>row.id)).size,cards.length,'Duplicate canonical IDs');
let favouriteChangesSinceBuild=0;
const rankedCards=cards.map(row=>{
  assert.ok(idPattern.test(row.id),'Unexpected noncanonical ID '+row.id);
  assert.ok(row.card&&typeof row.card==='object'&&!Array.isArray(row.card)&&row.card.id===row.id,'Inconsistent card identity '+row.id);
  const sourceId=String(row.source_id??row.card.sourceId??'');
  assert.match(sourceId,/^[1-9]\d{0,9}$/,'Missing canonical AniList source '+row.id);
  assert.ok(Number(sourceId)<=2147483647,'Source outside AniList Int32');
  if(row.source_id!=null&&row.card.sourceId!=null)assert.equal(Number(row.source_id),Number(row.card.sourceId),'Conflicting source identity '+row.id);
  const fav=row.card.fav;
  assert.ok((typeof fav==='number'||typeof fav==='string')&&Number.isFinite(Number(fav))&&Number(fav)>=0,'Missing factual favourite count '+row.id);
  const retained=seedById.get(row.id);
  if(retained){
    assert.equal(Number(sourceId),Number(retained.sourceId),'A retained canonical source identity changed');
    if(policy.favouriteCount(fav)!==retained.fav)favouriteChangesSinceBuild++;
  }
  // Live favourites and explicit album membership may legitimately differ from
  // the bundled fallback. Never overwrite them with a static seed rarity.
  return {id:row.id,sourceId,series:row.card.series,fav:policy.favouriteCount(fav)};
});
const cardRowsById=new Map(cards.map(row=>[row.id,row])),knownCards=new Set(cardRowsById.keys()),knownAlbums=new Set(albums.map(row=>row.id));
const membershipIds=new Map(albums.map(row=>[row.id,[]]));
const unresolvedMemberships=[];
for(const membership of memberships){
  if(!knownCards.has(membership.card_id)||!knownAlbums.has(membership.album_id)){unresolvedMemberships.push(membership);continue;}
  membershipIds.get(membership.album_id).push(membership.card_id);
}
const definitions=albums.map(album=>({...album,card_ids:membershipIds.get(album.id)}));
const ranking=policy.rankAlbumMythics(rankedCards,definitions);
const beforeDistribution=Object.fromEntries(rarityNames.map(name=>[name,0])),afterDistribution={...beforeDistribution};
const expected=new Map(),differences=[];
for(const card of rankedCards){
  const observed=cardRowsById.get(card.id).card;
  const rarity=policy.rarityFromPopularity(card.fav,card.sourceId,ranking),tier=tiers[rarity],fingerprint=hash(card.id),pow=tier[0]+fingerprint%tier[1],aura=pow-tier[2]+(fingerprint>>3)%3;
  const meta={rarity,pow,aura,rarity_policy:'album-ranks-v2'};
  expected.set(card.id,meta);afterDistribution[rarity]++;
  if(Object.hasOwn(beforeDistribution,observed.rarity))beforeDistribution[observed.rarity]++;
  if(Object.entries(meta).some(([key,value])=>observed[key]!==value))differences.push({id:card.id,sourceId:card.sourceId,fav:card.fav,observed:{rarity:observed.rarity,pow:observed.pow,aura:observed.aura,rarity_policy:observed.rarity_policy},expected:meta});
}
const publishedPools=boosters.map(booster=>{
  const ids=Array.isArray(booster.card_ids)?booster.card_ids:[],present=new Set(ids.map(id=>expected.get(id)?.rarity).filter(Boolean));
  return {id:booster.id,name:booster.name,cardCount:ids.length,unknownCardIds:ids.filter(id=>!knownCards.has(id)),missingRarities:['Rare','Épique','Légendaire','Mythique'].filter(rarity=>!present.has(rarity))};
});
const report={
  mode:'read-only-album-ranks-audit',preparedAtUTC:new Date().toISOString(),projectUrl:config.supabaseUrl,writeEnabled:false,sqlFile:null,executedUpdate:false,
  policy:'album-ranks-v2',ordinaryThresholds:JSON.parse(JSON.stringify(policy.FAVOURITE_THRESHOLDS)),cardCount:cards.length,albumCount:ranking.albums.length,managedAlbumCount:albums.length,favouriteChangesSinceBuild,
  beforeDistribution,afterDistribution,mythicSources:[...ranking.mythicSources].sort((left,right)=>Number(left)-Number(right)),insufficientAlbums:ranking.insufficientAlbums,unresolvedMemberships,differences,publishedPools,
  poolWarnings:publishedPools.filter(pool=>pool.unknownCardIds.length||pool.missingRarities.length),
  legacySqlStatus:'Old kizuna-popularity-update.sql artifacts are obsolete. Do not execute them. Live rarity writes use schema/kizuna_album_rarity_ranks.sql and its transactional rebalancer.',
};
await fs.mkdir(outputs,{recursive:true});
await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode:report.mode,writeEnabled:false,sqlFile:null,executedUpdate:false,cardCount:cards.length,albumCount:ranking.albums.length,differences:differences.length,insufficientAlbums:ranking.insufficientAlbums.length,poolWarnings:report.poolWarnings.length,reportFile,legacySqlStatus:report.legacySqlStatus},null,2));
