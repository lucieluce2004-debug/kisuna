import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context={window:{}};
vm.runInNewContext(await fs.readFile(new URL('../dist/kizuna-config.js',import.meta.url),'utf8'),context);
const config=context.window.KIZUNA_CONFIG;
const headers={apikey:config.supabaseKey,'Content-Type':'application/json'};
const call=(route,options={})=>fetch(config.supabaseUrl+route,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(18000)});
// --catalogue-only performs public table GETs exclusively. It does not start
// OAuth, call Auth/Edge routes, read player snapshots or issue database writes.
const catalogueOnly=process.argv.includes('--catalogue-only');
async function publicRows(table,select,order='id'){
  const rows=[];
  for(let offset=0;;offset+=1000){
    const response=await call('/rest/v1/'+table+'?'+new URLSearchParams({select,order,limit:'1000',offset:String(offset)}));
    assert.equal(response.status,200,'Public '+table+' metadata must be readable');
    const page=await response.json();assert.ok(Array.isArray(page)&&page.length<=1000,'Invalid '+table+' page');
    rows.push(...page);if(page.length<1000)return rows;
    assert.ok(rows.length<1000000,'Public catalogue pagination exceeded its safety bound');
  }
}
async function verifyPublicAlbumPolicy(){
  const scope={};vm.runInNewContext(await fs.readFile(new URL('../dist/kizuna-rarity.js',import.meta.url),'utf8'),scope);
  const policy=scope.KizunaRarity;
  assert.equal(typeof policy?.rankAlbumMythics,'function','The built shared album ranking must be available');
  const [cards,albums,members,html,seedText]=await Promise.all([
    publicRows('kizuna_cards','id,source_id,card'),
    publicRows('kizuna_albums','id,name,anime_id,cover_image'),
    publicRows('kizuna_album_cards','album_id,card_id','album_id,card_id'),
    fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8'),
    fs.readFile(new URL('../seed/catalogue.json',import.meta.url),'utf8'),
  ]);
  assert.ok(cards.length>=235,'The retained catalogue must remain available');
  const byId=new Map(cards.map(row=>[row.id,row]));assert.equal(byId.size,cards.length,'Canonical card IDs must stay unique');
  for(const retained of JSON.parse(seedText).filter(row=>row.id.startsWith('cseed-')))assert.ok(byId.has(retained.id),'Retained identity disappeared: '+retained.id);
  const definitions=new Map(albums.map(album=>[album.id,{...album,card_ids:[]}]));
  assert.equal(definitions.size,albums.length,'Shared album IDs must be unique');
  const pairs=new Set();
  for(const member of members){
    assert.ok(definitions.has(member.album_id),'Membership references a missing album');
    assert.ok(byId.has(member.card_id),'Membership references a missing canonical card');
    const pair=member.album_id+'|'+member.card_id;assert.ok(!pairs.has(pair),'Duplicate album membership');pairs.add(pair);
    definitions.get(member.album_id).card_ids.push(member.card_id);
  }
  const sources=new Map(),rankCards=cards.map(row=>{
    assert.ok(row.card&&typeof row.card==='object'&&!Array.isArray(row.card)&&row.card.id===row.id,'Inconsistent canonical card '+row.id);
    assert.match(row.id,/^(?:cseed-\d{4,8}|c[1-9]\d{0,9})$/,'Unexpected canonical ID');
    const source=String(row.source_id??row.card.sourceId??'');assert.match(source,/^[1-9]\d{0,9}$/,'Missing factual character source '+row.id);
    if(row.source_id!=null&&row.card.sourceId!=null)assert.equal(Number(row.source_id),Number(row.card.sourceId),'Conflicting source identity');
    assert.ok(Number.isSafeInteger(row.card.fav)&&row.card.fav>=0,'Invalid favourite count for '+row.id);
    assert.ok(typeof row.card.series==='string'&&row.card.series.trim(),'Canonical cards require an album series');
    sources.set(row.id,source);return {...row.card,id:row.id,sourceId:source,source_id:row.source_id};
  });
  const ranking=policy.rankAlbumMythics(rankCards,[...definitions.values()]);
  assert.equal(ranking.insufficientAlbums.length,0,'Albums with fewer than two distinct characters: '+Array.from(ranking.insufficientAlbums,album=>album.name).join(', '));
  assert.ok(ranking.albums.length>0,'At least one real album must be ranked');
  for(const album of ranking.albums){
    assert.equal(album.mythicSources.length,Math.min(5,album.distinctCharacters),'Top-five size differs for '+album.name);
    assert.deepEqual(Array.from(album.mythicSources),Array.from(album.sourceIds).slice(0,5),'Top-five favourites order differs for '+album.name);
    assert.equal(new Set(album.mythicSources).size,album.mythicSources.length,'Aliases must not consume multiple mythic slots');
    assert.deepEqual(Array.from(album.legendarySources),Array.from(album.sourceIds).slice(5,10),'Legendary ranks 6–10 differ for '+album.name);
    assert.deepEqual(Array.from(album.epicSources),Array.from(album.sourceIds).slice(10,15),'Epic ranks 11–15 differ for '+album.name);
  }
  const tierSource=html.match(/const TIER=(\{[^\n;]+\});/)?.[1],hashSource=html.match(/function hash\(s\)\{[^\n]*\}/)?.[0];
  assert.ok(tierSource&&hashSource,'Production stat definitions are missing');
  const tiers=vm.runInNewContext('('+tierSource+')'),hash=vm.runInNewContext(hashSource+';hash');
  const distribution=Object.fromEntries(['Mythique','Légendaire','Épique','Rare','Peu commune','Commun'].map(rarity=>[rarity,0]));
  for(const row of cards){
    const expected=policy.rarityFromPopularity(row.card.fav,sources.get(row.id),ranking);
    assert.equal(row.card.rarity,expected,row.id+' / '+row.card.name+' disagrees with live album top-five ranking');
    assert.equal(row.card.rarity_policy,'album-ranks-v2','Live metadata must carry the current ranking policy');
    const tier=tiers[expected],fingerprint=hash(row.id),pow=tier[0]+fingerprint%tier[1],aura=pow-tier[2]+(fingerprint>>3)%3;
    assert.equal(row.card.pow,pow,'Live power differs from the legacy ID hash for '+row.id);
    assert.equal(row.card.aura,aura,'Live aura differs from the legacy ID hash for '+row.id);distribution[expected]++;
  }
  assert.ok(Object.values(distribution).every(count=>count>0),'The live draw catalogue must retain all six rarities');
  const madara=cards.filter(row=>sources.get(row.id)==='53901');assert.ok(madara.length>0);assert.ok(madara.every(row=>row.card.rarity==='Mythique'),'Madara must retain the explicit mythic exception');
  return {cards,summary:{publicCatalogueRows:cards.length,distinctCharacterSources:new Set(sources.values()).size,managedAlbums:albums.length,albumMemberships:members.length,totalAlbums:ranking.albums.length,albumsBelowTwo:ranking.insufficientAlbums.length,albumTopFive:'all live card rarities match the shared policy',madara:'Mythique',legacyPowerAndAura:'all matched',distribution}};
}
const redirects={};
if(!catalogueOnly){
  const settingsResponse=await call('/auth/v1/settings');assert.equal(settingsResponse.status,200);const settings=await settingsResponse.json();
  assert.equal(settings.external?.discord,config.discordEnabled,'Discord provider and published configuration disagree');
  for(const [type,target] of [['signup',config.siteUrl+'/?auth=discord']]){
    const response=await call('/auth/v1/verify?token='+('0'.repeat(64))+'&type='+type+'&redirect_to='+encodeURIComponent(target),{redirect:'manual'});
    const destination=response.headers.get('location');assert.equal(response.status,303);
    const actual=new URL(destination),expected=new URL(target);
    assert.equal(actual.origin+actual.pathname+actual.search,expected.origin+expected.pathname+expected.search,'Auth redirect still falls back outside Kizuna');redirects[type]='allowed';
  }
}
const catalogueValidation=await verifyPublicAlbumPolicy();
if(catalogueOnly){console.log(JSON.stringify({...catalogueValidation.summary,scope:'public catalogue and album GETs only',sideEffects:'no Auth/Edge calls; no snapshot reads; no writes'},null,2));process.exit(0);}
const profiles=await call('/rest/v1/kizuna_profiles?select=id&limit=1');
assert.ok([401,403].includes(profiles.status),'Anonymous user profile access was not rejected');
for(const authorization of ['', 'Bearer invalid-test-token']){
  const denied=await call('/functions/v1/kizuna-catalogue-admin',{method:'POST',headers:authorization?{Authorization:authorization}:{},body:JSON.stringify({action:'search',search:'Naruto',page:1})});
  assert.equal(denied.status,401,'Admin AniList endpoint did not reject unauthenticated access');
  const profileDenied=await call('/functions/v1/kizuna-discord-profile',{method:'POST',headers:authorization?{Authorization:authorization}:{},body:'{}'});
  assert.equal(profileDenied.status,401,'Discord profile endpoint did not reject unauthenticated access');
  const staffDenied=await call('/functions/v1/kizuna-staff',{method:'POST',headers:authorization?{Authorization:authorization}:{},body:JSON.stringify({action:'me'})});
  assert.equal(staffDenied.status,401,'Staff endpoint did not reject unauthenticated access');
}
const drafts=await call('/rest/v1/kizuna_boosters?select=id&published=eq.false');
assert.equal(drafts.status,200);assert.deepEqual(await drafts.json(),[],'Anonymous visitors must never receive draft boosters');
const moderators=await call('/rest/v1/kizuna_moderators?select=user_id&limit=1');
assert.ok([401,403].includes(moderators.status),'Anonymous visitors must not receive moderator memberships');
const oauth=await call('/auth/v1/authorize?'+new URLSearchParams({provider:'discord',redirect_to:config.siteUrl+'/?auth=discord',code_challenge:'a'.repeat(43),code_challenge_method:'s256'}),{redirect:'manual'});
if(config.discordEnabled){
  assert.equal(oauth.status,302,'Supabase did not start Discord OAuth');
  const provider=new URL(oauth.headers.get('location'));
  assert.equal(provider.hostname,'discord.com');
  assert.equal(provider.searchParams.get('redirect_uri'),config.supabaseUrl+'/auth/v1/callback');
  assert.ok(provider.searchParams.get('state'));
  const scopes=provider.searchParams.get('scope').split(/\s+/).sort();
  assert.deepEqual(scopes,['email','identify']);
}else{
  assert.equal(oauth.status,400,'Provider is expected to stay disabled until configured');
}
console.log(JSON.stringify({discord:config.discordEnabled?'enabled; OAuth redirects to Discord':'awaiting provider setup',redirects,...catalogueValidation.summary,anonymousProfiles:'denied',discordProfile:'anonymous and invalid tokens denied',adminAniList:'anonymous and invalid tokens denied',staff:'anonymous and invalid tokens denied',boosterDrafts:'private',moderatorMemberships:'private',sideEffects:'no account created; no email sent'},null,2));
