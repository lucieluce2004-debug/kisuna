import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Prepare real catalogue cards only. The SQL is reviewed/executed separately,
// after the album-ranking migration. No player receives an owned card here.
const checkout=fileURLToPath(new URL('../',import.meta.url));
const outputs=path.resolve(checkout,'..','..','outputs');
const evidenceFile=path.join(outputs,'kizuna-album-minimum-repair.json');
const seedFile=path.join(checkout,'seed/extra-cards.json');
const sqlFile=path.join(outputs,'kizuna-album-companions.sql');
const summaryFile=path.join(outputs,'kizuna-album-companions-summary.json');
const evidence=JSON.parse(await fs.readFile(evidenceFile,'utf8'));
const checkedAt=evidence.aniListResearch?.completedAtUTC;
assert.ok(typeof checkedAt==='string'&&Number.isFinite(Date.parse(checkedAt)),'A verified AniList response timestamp is required');
const required=new Map([[124790,'Violet Evergarden'],[2653,'Ghost in the Shell'],[65445,'Kingdom']]);
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
const html=await fs.readFile(path.join(checkout,'dist/index.html'),'utf8');
const tierSource=html.match(/const TIER=(\{[^\n;]+\});/)?.[1];
const hashSource=html.match(/function hash\(s\)\{[^\n]*\}/)?.[0];
assert.ok(tierSource&&hashSource,'The production stat definitions are missing');
const tiers=vm.runInNewContext('('+tierSource+')'),hash=vm.runInNewContext(hashSource+';hash');
assert.deepEqual(Array.from(tiers.Mythique),[96,4,25]);
const companions=[];
for(const [source,albumName] of required){
  const proposal=evidence.aniListResearch.proposals.find(item=>Number(item.recommendedCompanion?.sourceId)===source);
  assert.ok(proposal&&proposal.albumName===albumName,'Missing verified album proposal '+albumName);
  const anime=proposal.rawAnime;
  assert.ok(anime&&anime.id===proposal.animeId&&anime.type==='ANIME'&&anime.isAdult===false,'Unverified anime context');
  const character=anime.characters?.nodes?.find(node=>node.id===source);
  assert.ok(character,'The selected character is not a member of the verified anime');
  assert.ok(Number.isSafeInteger(character.favourites)&&character.favourites>=0,'A factual favourite count is required');
  assert.equal(character.favourites,proposal.recommendedCompanion.favourites);
  const image=new URL(character.image?.large||'');
  assert.ok(image.protocol==='https:'&&!image.username&&!image.password&&!image.port&&(image.hostname==='anilist.co'||image.hostname.endsWith('.anilist.co')),'Invalid AniList artwork');
  assert.ok(image.href.length<=1500);
  const tags=(Array.isArray(anime.tags)?anime.tags:[]).map(tag=>clean(tag?.name,64).toLowerCase());
  const genres=(Array.isArray(anime.genres)?anime.genres:[]).map(genre=>clean(genre,64).toLowerCase());
  const cats=[];
  if(tags.includes('shounen'))cats.push('shonen');
  if(tags.includes('seinen'))cats.push('seinen');
  if(tags.includes('shoujo')||genres.includes('mahou shoujo'))cats.push('shojo');
  if(tags.includes('isekai'))cats.push('isekai');
  if(genres.includes('sports'))cats.push('sport');
  if(genres.includes('mecha'))cats.push('mecha');
  if(genres.includes('fantasy'))cats.push('fantasy');
  const gender=clean(character.gender,32).toLowerCase(),id='c'+source;
  // Each existing singleton plus its real companion has two distinct sources,
  // both selected by the album top-five rule. The DB trigger rechecks ranking.
  const rarity='Mythique',tier=tiers[rarity],fingerprint=hash(id),pow=tier[0]+fingerprint%tier[1];
  const card={sourceId:String(source),name:clean(character.name?.full,160),native:clean(character.name?.native,160),series:albumName,image:image.href,fav:character.favourites,g:gender==='female'?'F':gender==='male'?'M':'',cats,id,rank:1000000+source,rarity,tag:'',pow,aura:pow-tier[2]+(fingerprint>>3)%3,rarity_policy:'album-top5-v1',popularity_checked_at:checkedAt};
  assert.ok(card.name);
  companions.push({id,source_id:source,card});
}
assert.equal(companions.length,3);assert.equal(new Set(companions.map(row=>row.id)).size,3);
let existing=[];
if(process.argv.includes('--check-public')){
  const context={window:{}};vm.runInNewContext(await fs.readFile(path.join(checkout,'dist/kizuna-config.js'),'utf8'),context);
  const config=context.window.KIZUNA_CONFIG;
  assert.equal(new URL(config.supabaseUrl).origin,'https://hxbujmdzidtwmalmqrwt.supabase.co');
  const endpoint=new URL('/rest/v1/kizuna_cards',config.supabaseUrl);
  endpoint.search=new URLSearchParams({select:'id,source_id,card',source_id:'in.('+[...required.keys()].join(',')+')',order:'id',limit:'1000'}).toString();
  const response=await fetch(endpoint,{headers:{apikey:config.supabaseKey,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,'Public canonical lookup failed');existing=await response.json();assert.ok(Array.isArray(existing));
  for(const row of existing)assert.ok(row.card?.id===row.id&&required.has(Number(row.source_id)),'An existing canonical winner is inconsistent');
}
const checks=companions.map(row=>({source_id:row.source_id,series:row.card.series}));
const rowJson=JSON.stringify(companions),checkJson=JSON.stringify(checks);
assert.ok(!rowJson.includes('$companion_rows$')&&!checkJson.includes('$companion_groups$'));
const sql=`-- Real AniList companions verified ${checkedAt}; catalogue metadata only.
-- Execute after the album-ranking trigger migration. Existing canonical rows
-- always win, even if an import occurred after preparation. No direct UPDATE,
-- Auth, role, wallet or owned-card operation is performed by this script.
-- The catalogue trigger is responsible for recalculating album-based rarity.
begin;
do $kizuna_album_companions$
declare
  v_rows jsonb:=$companion_rows$${rowJson}$companion_rows$::jsonb;
  v_groups jsonb:=$companion_groups$${checkJson}$companion_groups$::jsonb;
  v_entry jsonb;
  v_source bigint;
  v_winner_id text;
  v_winner_card jsonb;
  v_group text;
  v_managed uuid;
  v_count integer;
begin
  if jsonb_array_length(v_rows)<>3 then raise exception 'Companion preparation must contain exactly three verified cards'; end if;
  -- Match the catalogue's BEFORE-statement trigger before any row locks, so
  -- companion retries and ordinary imports share one consistent lock order.
  perform pg_catalog.pg_advisory_xact_lock(17493,500);
  for v_entry in select value from jsonb_array_elements(v_rows) loop
    v_source:=(v_entry->>'source_id')::bigint;
    if v_source not in (124790,2653,65445) or v_entry->>'id'<>'c'||v_source::text
      or v_entry#>>'{card,id}' is distinct from v_entry->>'id'
      or v_entry#>>'{card,sourceId}' is distinct from v_source::text then raise exception 'Invalid verified companion identity'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kizuna-companion-source:'||v_source::text,17494));
    select c.id,c.card into v_winner_id,v_winner_card from public.kizuna_cards c
      where c.source_id=v_source order by c.id limit 1 for update of c;
    if not found then
      insert into public.kizuna_cards(id,source_id,card)
        values(v_entry->>'id',v_source,v_entry->'card') on conflict(id) do nothing;
      select c.id,c.card into v_winner_id,v_winner_card from public.kizuna_cards c
        where c.source_id=v_source order by c.id limit 1 for update of c;
    end if;
    if v_winner_id is null or jsonb_typeof(v_winner_card)<>'object' or v_winner_card->>'id' is distinct from v_winner_id then
      raise exception 'Canonical companion winner is missing or inconsistent for %',v_source;
    end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(v_groups) loop
    v_group:=v_entry->>'series';v_source:=(v_entry->>'source_id')::bigint;
    if not exists(select 1 from public.kizuna_cards c where c.source_id=v_source) then raise exception 'A verified companion source is missing'; end if;
    select a.id into v_managed from public.kizuna_albums a where lower(btrim(a.name))=lower(btrim(v_group));
    if found then
      select count(distinct c.source_id) into v_count from public.kizuna_album_cards m
        join public.kizuna_cards c on c.id=m.card_id where m.album_id=v_managed;
    else
      select count(distinct c.source_id) into v_count from public.kizuna_cards c
        where lower(btrim(c.card->>'series'))=lower(btrim(v_group));
    end if;
    if v_count<2 then raise exception 'Album % still has fewer than two distinct characters; review canonical membership',v_group; end if;
  end loop;
end;
$kizuna_album_companions$;
select id,source_id,card->>'name' as name,card->>'series' as series,card->>'rarity' as rarity
  from public.kizuna_cards where source_id in (124790,2653,65445) order by source_id,id;
commit;
`;
await fs.mkdir(outputs,{recursive:true});await fs.mkdir(path.dirname(seedFile),{recursive:true});
// This older minimum-size repair must never truncate later catalogue batches.
const retainedExtras=JSON.parse(await fs.readFile(seedFile,'utf8').catch(error=>{if(error.code==='ENOENT')return '[]';throw error;}));
assert.ok(Array.isArray(retainedExtras),'Retained extras must be an array');
const retainedIds=new Set(retainedExtras.map(row=>row.id)),retainedSources=new Set(retainedExtras.map(row=>String(row.source_id??row.card?.sourceId)));
const mergedExtras=[...retainedExtras,...companions.filter(row=>!retainedIds.has(row.id)&&!retainedSources.has(String(row.source_id)))];
await fs.writeFile(seedFile,JSON.stringify(mergedExtras,null,2)+'\n');
await fs.writeFile(sqlFile,sql);
const summary={preparedAtUTC:new Date().toISOString(),source:'https://graphql.anilist.co',checkedAtUTC:checkedAt,seedFile,sqlFile,companions:companions.map(row=>({id:row.id,sourceId:row.source_id,name:row.card.name,series:row.card.series,fav:row.card.fav,rarity:row.card.rarity,pow:row.card.pow,aura:row.card.aura,g:row.card.g,cats:row.card.cats})),publicCanonicalLookup:process.argv.includes('--check-public'),existingCanonicalWinners:existing.map(row=>({id:row.id,sourceId:row.source_id,series:row.card.series})),executedDatabaseWrite:false};
await fs.writeFile(summaryFile,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
