import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {transform} from 'esbuild';

// Merge the three verified AniList evidence lots, keeping every existing
// canonical source/series and at most 30 distinct characters in each album.
// Only a public GET is performed. Generated SQL is never executed here.
const checkout=fileURLToPath(new URL('../',import.meta.url));
const outputs=path.resolve(checkout,'..','..','outputs');
const extraFile=path.join(checkout,'seed/extra-cards.json');
const sqlFile=path.join(outputs,'kizuna-album-expansion.sql');
const summaryFile=path.join(outputs,'kizuna-album-expansion-summary.json');
const evidenceFiles=['a','b','c'].map(lot=>path.join(outputs,'kizuna-album-expansion-'+lot+'.json'));
// AniList has two separately identified, unnamed refuse collectors under this
// role label. They are real entries, but do not meet the named-character scope.
const excludedGenericSources=new Set(['404101','404102']);
const previousExtras=JSON.parse(await fs.readFile(extraFile,'utf8')).filter(row=>!excludedGenericSources.has(String(row.source_id??row.card?.sourceId)));
assert.ok(Array.isArray(previousExtras));
const originalCompanions=previousExtras.filter(row=>[124790,2653,65445].includes(Number(row.source_id)));
assert.equal(originalCompanions.length,3,'The three previous real companions must remain present');
const originalCompanionsJson=JSON.stringify(originalCompanions);
const sourceOf=row=>String(row.source_id??row.card?.sourceId??'');
const keyOf=value=>String(value||'').trim().toLowerCase();
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
const generic=/^(narrator|narration|unknown|unnamed(?: .*)?|students?|male student|female student|man|woman|boy|girl|children?|guards?|villagers?|townsperson|townspeople|reporter|announcer|receptionist|shopkeeper|bartender|seisou kyokuin)$/i;
function safeImage(raw){
  try{const url=new URL(raw);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(url.hostname==='anilist.co'||url.hostname.endsWith('.anilist.co'))&&url.href.length<=1500&&!/(?:^|\/)(default|placeholder|no[_-]?image)(?:\.[a-z]+)?$/i.test(url.pathname)?url.href:null;}catch{return null;}
}
function validateRow(row){
  assert.ok(row&&typeof row.id==='string'&&row.card?.id===row.id,'Invalid canonical identity');
  assert.match(sourceOf(row),/^[1-9]\d{0,9}$/);assert.ok(Number(sourceOf(row))<=2147483647);
  assert.ok(typeof row.card.series==='string'&&row.card.series.trim());
  assert.ok(Number.isSafeInteger(row.card.fav)&&row.card.fav>=0&&row.card.fav<=1000000000,'Missing factual favourites for '+row.id);
}
const configScope={window:{}};vm.runInNewContext(await fs.readFile(path.join(checkout,'dist/kizuna-config.js'),'utf8'),configScope);
const config=configScope.window.KIZUNA_CONFIG;
assert.equal(new URL(config.supabaseUrl).origin,'https://hxbujmdzidtwmalmqrwt.supabase.co');
async function publicRows(table,select){
  const rows=[];
  for(let offset=0;;offset+=1000){
    const endpoint=new URL('/rest/v1/'+table,config.supabaseUrl);endpoint.search=new URLSearchParams({select,order:'id',limit:'1000',offset:String(offset)}).toString();
    const response=await fetch(endpoint,{headers:{apikey:config.supabaseKey,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200,'Public canonical lookup failed');const page=await response.json();assert.ok(Array.isArray(page)&&page.length<=1000);rows.push(...page);if(page.length<1000)return rows;
    assert.ok(rows.length<1000000,'Public pagination exceeded its safety bound');
  }
}
const [publicCards,managedAlbums]=await Promise.all([publicRows('kizuna_cards','id,source_id,card'),publicRows('kizuna_albums','id,name')]);
assert.equal(managedAlbums.length,0,'Managed album membership requires separate review before this implicit-album expansion');
publicCards.forEach(validateRow);previousExtras.forEach(validateRow);
assert.ok(publicCards.every(row=>!excludedGenericSources.has(sourceOf(row))),'Excluded unnamed roles are already in the database; explicit review is required');
const publicById=new Map(publicCards.map(row=>[row.id,row]));assert.equal(publicById.size,publicCards.length);
const publicSources=new Map();
for(const row of publicCards)if(!publicSources.has(sourceOf(row)))publicSources.set(sourceOf(row),row);
const combined=new Map(publicById);
for(const row of previousExtras){
  const winner=publicSources.get(sourceOf(row));
  if(winner&&winner.id!==row.id)throw new Error('A different canonical identity already owns source '+sourceOf(row)+'; review before bundling a duplicate alias');
  if(!combined.has(row.id))combined.set(row.id,row);
}
const claims=new Map();
for(const row of combined.values())if(!claims.has(sourceOf(row)))claims.set(sourceOf(row),row);
const inventory=rows=>{
  const groups=new Map();
  for(const row of rows){const key=keyOf(row.card.series),entry=groups.get(key)||{name:row.card.series.trim(),sources:new Set(),cards:0};entry.sources.add(sourceOf(row));entry.cards++;groups.set(key,entry);}
  return groups;
};
const beforeGroups=inventory(publicCards),logicalGroups=inventory(combined.values());
const verifiedGroups=new Map(),evidenceSummary=[];
for(const filename of evidenceFiles){
  const document=JSON.parse(await fs.readFile(filename,'utf8'));
  assert.equal(document.version,1,'The evidence lot has not completed normalization: '+filename);
  assert.notEqual(document.complete,false,'Partial AniList evidence cannot be merged');
  assert.equal(document.groups?.length,13,'Expected thirteen verified anime per lot');
  for(const request of document.requests||[])assert.equal(request.status,200,'A failed AniList request must be resolved first');
  evidenceSummary.push({file:filename,retrievedAtUTC:document.retrievedAtUTC,groups:document.groups.length,requests:document.requests?.length||0});
  for(const group of document.groups){
    const key=keyOf(group.groupName),anime=group.anime;
    assert.ok(key&&beforeGroups.has(key),'Evidence does not match an existing album: '+group.groupName);
    assert.ok(!verifiedGroups.has(key),'Duplicate evidence album '+group.groupName);
    assert.ok(anime&&anime.id===group.animeId&&anime.type==='ANIME'&&anime.isAdult===false,'Unverified anime identity for '+group.groupName);
    assert.ok(clean(anime.title?.english||anime.title?.romaji,180),'Missing official anime title');
    assert.ok(Array.isArray(group.characters));
    verifiedGroups.set(key,{...group,checkedAt:group.verifiedAtUTC||document.retrievedAtUTC||document.finishedAtUTC,evidenceFile:filename});
  }
}
assert.equal(verifiedGroups.size,39);assert.equal(beforeGroups.size,39,'The current album list changed; review the evidence mapping');
const additions=[],selectionReports=[],provenance=[];
for(const [key,group] of [...verifiedGroups].sort(([a],[b])=>a<b?-1:a>b?1:0)){
  const album=logicalGroups.get(key),old=beforeGroups.get(key),selected=[],rejections=[];
  const characters=group.characters.slice().sort((a,b)=>b.favourites-a.favourites||a.id-b.id);
  for(const character of characters){
    if(album.sources.size>=30)break;
    const source=String(character?.id??''),name=clean(character?.name?.full,160),image=safeImage(character?.image?.large);
    if(!/^[1-9]\d{0,9}$/.test(source)||Number(source)>2147483647||excludedGenericSources.has(source)||!name||generic.test(name)||!image||!Number.isSafeInteger(character.favourites)||character.favourites<0||character.favourites>1000000000){rejections.push({sourceId:source,name,reason:'not-a-verified-named-illustrated-character'});continue;}
    if(album.sources.has(source))continue;
    const existing=claims.get(source);
    if(existing){rejections.push({sourceId:source,name,reason:'canonical-source-already-belongs-to-another-album',existingId:existing.id,existingSeries:existing.card.series});continue;}
    const id='c'+source;assert.ok(!combined.has(id),'Canonical ID is already occupied by a different source: '+id);
    const tags=(group.anime.tags||[]).map(tag=>clean(tag?.name,64).toLowerCase()),genres=(group.anime.genres||[]).map(genre=>clean(genre,64).toLowerCase()),cats=[];
    if(tags.includes('shounen'))cats.push('shonen');if(tags.includes('seinen'))cats.push('seinen');if(tags.includes('shoujo')||genres.includes('mahou shoujo'))cats.push('shojo');if(tags.includes('isekai'))cats.push('isekai');if(genres.includes('sports'))cats.push('sport');if(genres.includes('mecha'))cats.push('mecha');if(genres.includes('fantasy'))cats.push('fantasy');
    const gender=clean(character.gender,32).toLowerCase();
    const row={id,source_id:Number(source),card:{id,sourceId:source,name,native:clean(character.name?.native,160),series:old.name,image,fav:character.favourites,g:gender==='female'?'F':gender==='male'?'M':'',cats,rank:1000000+Number(source),tag:'',rarity_policy:'album-ranks-v2',popularity_checked_at:group.checkedAt}};
    assert.ok(typeof group.checkedAt==='string'&&Number.isFinite(Date.parse(group.checkedAt)),'Missing evidence timestamp');
    additions.push(row);combined.set(id,row);claims.set(source,row);album.sources.add(source);album.cards++;selected.push(source);
    provenance.push({id,sourceId:Number(source),albumName:old.name,animeId:group.animeId,officialTitle:group.anime.title.english||group.anime.title.romaji,verifiedAtUTC:group.checkedAt,evidenceFile:group.evidenceFile});
  }
  selectionReports.push({name:old.name,animeId:group.animeId,beforeCards:old.cards,beforeDistinctCharacters:old.sources.size,afterCards:album.cards,afterDistinctCharacters:album.sources.size,addedCharacters:album.sources.size-old.sources.size,availableNamedIllustratedCandidates:characters.length,belowThirty:album.sources.size<30,rejections});
}
const policySource=await fs.readFile(path.join(checkout,'supabase/functions/_shared/rarity-policy.ts'),'utf8');
const compiled=await transform(policySource,{loader:'ts',format:'cjs',target:'es2022'}),module={exports:{}};
vm.runInNewContext(compiled.code,{module,exports:module.exports});const policy=module.exports;
assert.equal(policy.FAVOURITE_THRESHOLDS.Rare,2500);assert.equal(policy.FAVOURITE_THRESHOLDS['Peu commune'],1000);
const context=policy.rankAlbumMythics([...combined.values()].map(row=>({...row.card,sourceId:sourceOf(row)})));
assert.equal(context.insufficientAlbums.length,0,'Every expanded album must have at least two distinct real characters');
const html=await fs.readFile(path.join(checkout,'dist/index.html'),'utf8'),tierSource=html.match(/const TIER=(\{[^\n;]+\});/)?.[1],hashSource=html.match(/function hash\(s\)\{[^\n]*\}/)?.[0];
assert.ok(tierSource&&hashSource);const tiers=vm.runInNewContext('('+tierSource+')'),hash=vm.runInNewContext(hashSource+';hash');
const distribution=Object.fromEntries(['Mythique','Légendaire','Épique','Rare','Peu commune','Commun'].map(name=>[name,0]));
for(const row of combined.values()){
  const rarity=policy.rarityFromPopularity(row.card.fav,sourceOf(row),context);distribution[rarity]++;
  if(additions.includes(row)){const tier=tiers[rarity],fingerprint=hash(row.id),pow=tier[0]+fingerprint%tier[1];Object.assign(row.card,{rarity,pow,aura:pow-tier[2]+(fingerprint>>3)%3});}
}
for(const [rarity,count] of Object.entries(distribution))assert.ok(count>0,'The expansion must preserve a real draw pool for '+rarity);
const extras=[...previousExtras,...additions];assert.equal(new Set(extras.map(row=>row.id)).size,extras.length);assert.equal(new Set(extras.map(sourceOf)).size,extras.length);
assert.equal(JSON.stringify(extras.filter(row=>[124790,2653,65445].includes(Number(row.source_id)))),originalCompanionsJson,'The three previous companions changed');
const groupChecks=selectionReports.map(group=>({name:group.name,beforeDistinct:group.beforeDistinctCharacters,maxDistinct:Math.max(30,group.beforeDistinctCharacters)}));
const rowJson=JSON.stringify(extras),groupJson=JSON.stringify(groupChecks),bodyTag='$kizuna_album_expansion$',rowsTag='$kizuna_expansion_rows$',groupsTag='$kizuna_expansion_groups$';
for(const tag of [bodyTag,rowsTag,groupsTag])assert.ok(!rowJson.includes(tag)&&!groupJson.includes(tag),'Unsafe SQL payload delimiter');
const sql=`-- Verified AniList expansion of the existing 39 Kizuna albums.
-- Preparation only. Run after the album-ranks-v2 migration. One INSERT causes
-- one catalogue rebalancing pass; existing identities, artwork, names, factual
-- favourites and every player/account/wallet record remain untouched.
begin;
set local search_path='';
do ${bodyTag}
declare
  v_rows jsonb:=${rowsTag}${rowJson}${rowsTag}::jsonb;
  v_groups jsonb:=${groupsTag}${groupJson}${groupsTag}::jsonb;
  v_protected jsonb;
  v_group jsonb;
  v_count integer;
  v_added integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(17493,500);
  if jsonb_array_length(v_rows)<>${extras.length}
    or (select count(distinct p.source_id) from jsonb_to_recordset(v_rows) p(source_id bigint))<>${extras.length} then
    raise exception 'Expansion identity count mismatch';
  end if;
  if exists(select 1 from jsonb_to_recordset(v_rows) p(id text,source_id bigint,card jsonb)
    where p.source_id not between 1 and 2147483647 or p.id is distinct from 'c'||p.source_id::text
      or p.card->>'id' is distinct from p.id or p.card->>'sourceId' is distinct from p.source_id::text) then
    raise exception 'Expansion contains an inconsistent canonical identity';
  end if;
  select coalesce(jsonb_object_agg(c.id,jsonb_build_object('source_id',c.source_id,'created_at',c.created_at,
    'card',c.card-array['rarity','pow','aura','rarity_policy'])),'{}'::jsonb) into v_protected from public.kizuna_cards c;
  with candidates as (
    select p.id,p.source_id,p.card from jsonb_to_recordset(v_rows) p(id text,source_id bigint,card jsonb)
    where not exists(select 1 from public.kizuna_cards c where private.kizuna_card_source(c.source_id,c.card)=p.source_id::text)
  ), inserted as (
    insert into public.kizuna_cards(id,source_id,card)
      select p.id,p.source_id,p.card from candidates p order by p.source_id
      on conflict(id) do nothing returning id
  ) select count(*) into v_added from inserted;
  if exists(select 1 from jsonb_to_recordset(v_rows) p(source_id bigint)
    where not exists(select 1 from public.kizuna_cards c where private.kizuna_card_source(c.source_id,c.card)=p.source_id::text and c.card->>'id'=c.id)) then
    raise exception 'An expansion source lacks a consistent canonical winner';
  end if;
  if exists(select 1 from jsonb_each(v_protected) old left join public.kizuna_cards c on c.id=old.key
    where jsonb_build_object('source_id',c.source_id,'created_at',c.created_at,
      'card',c.card-array['rarity','pow','aura','rarity_policy']) is distinct from old.value) then
    raise exception 'Expansion modified protected existing catalogue attributes';
  end if;
  for v_group in select value from jsonb_array_elements(v_groups) loop
    select count(distinct coalesce(c.source_id::text,c.card->>'sourceId')) into v_count from public.kizuna_cards c
      where lower(btrim(c.card->>'series'))=lower(btrim(v_group->>'name'));
    if v_count<2 or v_count>(v_group->>'maxDistinct')::integer then
      raise exception 'Album % violates the distinct-character cap/minimum; regenerate from current metadata',v_group->>'name';
    end if;
  end loop;
  select count(distinct c.card->>'rarity') into v_count from public.kizuna_cards c
    where c.card->>'rarity' in ('Mythique','Légendaire','Épique','Rare','Peu commune','Commun');
  if v_count<>6 then raise exception 'Expanded catalogue does not support all six booster rarities'; end if;
  perform pg_catalog.set_config('kizuna.expansion_inserted',v_added::text,true);
end;
${bodyTag};
select (select count(*) from public.kizuna_cards) as total_cards,
  pg_catalog.current_setting('kizuna.expansion_inserted')::integer as inserted_cards,
  (select count(distinct coalesce(source_id::text,card->>'sourceId')) from public.kizuna_cards) as distinct_characters,
  (select count(distinct lower(btrim(card->>'series'))) from public.kizuna_cards) as albums,
  (select jsonb_object_agg(rarity,n) from (select card->>'rarity' as rarity,count(*) as n from public.kizuna_cards group by card->>'rarity') tiers) as rarity_distribution;
commit;
`;
await fs.writeFile(extraFile,JSON.stringify(extras,null,2)+'\n');await fs.writeFile(sqlFile,sql);
const priorSummary=JSON.parse(await fs.readFile(summaryFile,'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error;}));
const extraIds=new Set(extras.map(row=>row.id));
const fullProvenance=[...new Map([...(priorSummary.provenance||[]),...provenance].filter(item=>extraIds.has(item.id)&&!excludedGenericSources.has(String(item.sourceId))).map(item=>[item.id,item])).values()];
const summary={preparedAtUTC:new Date().toISOString(),evidence:evidenceSummary,capDistinctCharactersPerAlbum:30,originalPublicCards:publicCards.length,originalCompanionsPreserved:3,newRowsAppendedToSeed:additions.length,pendingCanonicalSources:extras.filter(row=>!publicSources.has(sourceOf(row))).length,extraSeedRows:extras.length,projectedCatalogueCards:combined.size,projectedDistinctCharacters:new Set([...combined.values()].map(sourceOf)).size,albumCount:selectionReports.length,distribution,albums:selectionReports,provenance:fullProvenance,excludedGenericSources:[...excludedGenericSources],extraFile,sqlFile,summaryFile,executedDatabaseWrite:false};
await fs.writeFile(summaryFile,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,albums:selectionReports.map(({rejections,...group})=>({...group,rejectedCandidates:rejections.length})),provenance:undefined},null,2));
