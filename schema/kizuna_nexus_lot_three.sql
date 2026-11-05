-- Nexus lot 3: protected editorial configuration; apply once as one transaction.
-- No balance, inventory, claim, progression or drawing probability is rewritten.
select pg_advisory_xact_lock(17493,700);
do $$begin
 if (select version from kizuna_private.kizuna_nexus_config where id)<>2 then raise exception 'NEXUS_LOT_THREE_VERSION';end if;
end; $$;

create table kizuna_private.kizuna_nexus_lot_three_backup(
 id boolean primary key default true check(id),captured_at timestamptz not null default now(),
 functions jsonb not null,states jsonb not null,configuration jsonb not null
);
insert into kizuna_private.kizuna_nexus_lot_three_backup(functions,states,configuration)
select (select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='kizuna_private' and p.proname in('nexus_bonuses','nexus_refresh_stock','nexus_weekly_publication_guard')),
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.kizuna_player_states s),
 jsonb_build_object('config',(select to_jsonb(c) from kizuna_private.kizuna_nexus_config c where c.id),
 'nodes',(select jsonb_agg(to_jsonb(n)) from kizuna_private.kizuna_nexus_nodes n),
 'albums',(select jsonb_agg(to_jsonb(a)) from kizuna_private.kizuna_nexus_album_rewards a),
 'cosmetics',(select jsonb_agg(to_jsonb(c)) from kizuna_private.kizuna_nexus_cosmetics c),
 'weeklyBooster',(select to_jsonb(b) from public.kizuna_boosters b join kizuna_private.kizuna_nexus_config c on c.weekly_booster_id=b.id where c.id));

alter table kizuna_private.kizuna_nexus_config add column recycle_bonuses integer[] not null default array[500,500,500]
 check(cardinality(recycle_bonuses)=3 and array_ndims(recycle_bonuses)=1 and array_lower(recycle_bonuses,1)=1 and array_position(recycle_bonuses,null) is null
 and recycle_bonuses[1] between 0 and 1500 and recycle_bonuses[2] between 0 and 1500 and recycle_bonuses[3] between 0 and 1500
 and recycle_bonuses[1]+recycle_bonuses[2]+recycle_bonuses[3]<=1500);
create table kizuna_private.kizuna_nexus_admin_draft(
 id boolean primary key default true check(id),draft jsonb not null,revision bigint not null default 1 check(revision>0),
 published_revision bigint not null default 1,updated_at timestamptz not null default now(),updated_by uuid references public.kizuna_profiles(id) on delete set null
);
create table kizuna_private.kizuna_nexus_admin_history(
 version integer primary key,revision bigint not null,config jsonb not null,actor uuid references public.kizuna_profiles(id) on delete set null,
 action text not null check(action in('initial','publish')),created_at timestamptz not null default now(),summary jsonb not null default '{}'
);
create table kizuna_private.kizuna_nexus_admin_receipts(
 actor uuid not null references public.kizuna_profiles(id) on delete cascade,request_id uuid not null,payload_hash text not null,
 version integer not null references kizuna_private.kizuna_nexus_admin_history(version),created_at timestamptz not null default now(),primary key(actor,request_id)
);
create index kizuna_nexus_admin_receipt_version on kizuna_private.kizuna_nexus_admin_receipts(version);
create index kizuna_nexus_admin_history_actor on kizuna_private.kizuna_nexus_admin_history(actor);
create index kizuna_nexus_admin_draft_actor on kizuna_private.kizuna_nexus_admin_draft(updated_by);
do $$declare t text;begin
 foreach t in array array['kizuna_nexus_lot_three_backup','kizuna_nexus_admin_draft','kizuna_nexus_admin_history','kizuna_nexus_admin_receipts'] loop
  execute format('alter table kizuna_private.%I enable row level security',t);
  execute format('revoke all on kizuna_private.%I from public,anon,authenticated',t);
  execute format('grant all on kizuna_private.%I to service_role',t);
  execute format('create policy nexus_service_access on kizuna_private.%I for all to service_role using(true) with check(true)',t);
 end loop;
end; $$;

create function kizuna_private.nexus_admin_document() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'nodes',(select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'cost',n.cost,'requiredLevel',n.required_level,'prerequisites',n.prerequisites,'enabled',n.enabled) order by n.branch,n.tier) from kizuna_private.kizuna_nexus_nodes n),
 'economy',jsonb_build_object('dailyBoosters',c.daily_boosters,'storageBonuses',c.storage_bonuses,'priorityBonuses',c.priority_bonuses,'recycleBonuses',c.recycle_bonuses,
 'recycleCapBps',c.recycle_cap_bps,'fragmentsBasic',c.fragments_basic,'fragmentsAdvanced',c.fragments_advanced,'fragmentsDailyCap',c.fragments_daily_cap,
 'prestigeDailyChakra',c.prestige_daily_chakra,'weeklyBasic',c.weekly_basic,'weeklyAdvanced',c.weekly_advanced,'prestigeOnceChakra',c.prestige_once_chakra,'prestigeOncePacks',c.prestige_once_packs),
 'weeklyBooster',jsonb_build_object('name',b.name,'description',b.description,'cardIds',array(select x from unnest(b.card_ids) x order by x),'enabled',c.weekly_enabled),
 'cosmetics',(select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'cost',x.cost,'enabled',x.enabled) order by x.id) from kizuna_private.kizuna_nexus_cosmetics x),
 'albums',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'chakra',a.chakra,'packs',a.packs,'enabled',a.enabled) order by a.id),'[]') from kizuna_private.kizuna_nexus_album_rewards a))
 from kizuna_private.kizuna_nexus_config c join public.kizuna_boosters b on b.id=c.weekly_booster_id where c.id;
$$;

create function kizuna_private.nexus_admin_keys(v jsonb,keys text[]) returns boolean language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(v)='object' then (select count(*)=cardinality(keys) and bool_and(x=any(keys)) from jsonb_object_keys(v) x) else false end;
$$;
create function kizuna_private.nexus_admin_int(v jsonb,lo bigint,hi bigint) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;begin
 if jsonb_typeof(v) is distinct from 'number' or char_length(v::text)>16 or v::text !~ '^[0-9]+$' then return false;end if;
 n:=v::text::numeric;return n between lo and hi and trunc(n)=n;
end; $$;
create function kizuna_private.nexus_admin_text(v jsonb,lo integer,hi integer) returns boolean language sql immutable security invoker set search_path='' as $$
 select jsonb_typeof(v)='string' and char_length(btrim(v#>>'{}')) between lo and hi;
$$;
create function kizuna_private.nexus_admin_array(v jsonb,n integer,hi integer) returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;
 if jsonb_array_length(v)<>n then return false;end if;
 if exists(select 1 from jsonb_array_elements(v) x where not kizuna_private.nexus_admin_int(x,0,hi)) then return false;end if;
 return (select sum((x#>>'{}')::numeric)<=hi from jsonb_array_elements(v) x);
end; $$;

create function kizuna_private.nexus_admin_validate(v jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e jsonb;w jsonb;n jsonb;x jsonb;k text;ids text[];seen text[]:='{}';all_ids text[];cycle_found boolean;normalized jsonb;
begin
 if v is null or octet_length(v::text)>300000 or not kizuna_private.nexus_admin_keys(v,array['nodes','economy','weeklyBooster','cosmetics','albums']) then raise exception 'NEXUS_ADMIN_INVALID_CONFIG';end if;
 e:=v->'economy';w:=v->'weeklyBooster';
 if not kizuna_private.nexus_admin_keys(e,array['dailyBoosters','storageBonuses','priorityBonuses','recycleBonuses','recycleCapBps','fragmentsBasic','fragmentsAdvanced','fragmentsDailyCap','prestigeDailyChakra','weeklyBasic','weeklyAdvanced','prestigeOnceChakra','prestigeOncePacks']) then raise exception 'NEXUS_ADMIN_INVALID_CONFIG';end if;
 if not kizuna_private.nexus_admin_array(e->'dailyBoosters',3,4) or not kizuna_private.nexus_admin_array(e->'storageBonuses',2,3)
 or not kizuna_private.nexus_admin_array(e->'priorityBonuses',3,20) or not kizuna_private.nexus_admin_array(e->'recycleBonuses',3,1500)
 or not kizuna_private.nexus_admin_int(e->'recycleCapBps',0,1500) or not kizuna_private.nexus_admin_int(e->'fragmentsBasic',0,10)
 or not kizuna_private.nexus_admin_int(e->'fragmentsAdvanced',0,10) or not kizuna_private.nexus_admin_int(e->'fragmentsDailyCap',0,100)
 or not kizuna_private.nexus_admin_int(e->'prestigeDailyChakra',0,1000) or not kizuna_private.nexus_admin_int(e->'weeklyBasic',0,5)
 or not kizuna_private.nexus_admin_int(e->'weeklyAdvanced',0,10) or not kizuna_private.nexus_admin_int(e->'prestigeOnceChakra',0,100000)
 or not kizuna_private.nexus_admin_int(e->'prestigeOncePacks',0,1000) then raise exception 'NEXUS_ADMIN_BOUNDS';end if;
 if (e->>'fragmentsAdvanced')::integer<(e->>'fragmentsBasic')::integer or (e->>'weeklyAdvanced')::integer<(e->>'weeklyBasic')::integer then raise exception 'NEXUS_ADMIN_BOUNDS';end if;

 if jsonb_typeof(v->'nodes') is distinct from 'array' then raise exception 'NEXUS_ADMIN_INVALID_NODES';end if;
 select array_agg(z.id order by z.id) into all_ids from kizuna_private.kizuna_nexus_nodes z;
 if jsonb_array_length(v->'nodes')<>cardinality(all_ids) then raise exception 'NEXUS_ADMIN_INVALID_NODES';end if;
 for n in select value from jsonb_array_elements(v->'nodes') loop
  if not kizuna_private.nexus_admin_keys(n,array['id','name','cost','requiredLevel','prerequisites','enabled']) or jsonb_typeof(n->'id') is distinct from 'string'
   or not (n->>'id'=any(all_ids)) or n->>'id'=any(seen) or not coalesce(kizuna_private.nexus_admin_text(n->'name',2,80),false)
   or not kizuna_private.nexus_admin_int(n->'cost',1,1000000000) or not kizuna_private.nexus_admin_int(n->'requiredLevel',1,10000)
   or jsonb_typeof(n->'enabled') is distinct from 'boolean' or jsonb_typeof(n->'prerequisites') is distinct from 'array' then raise exception 'NEXUS_ADMIN_INVALID_NODES';end if;
  seen:=array_append(seen,n->>'id');
  if jsonb_array_length(n->'prerequisites')>25 or exists(select 1 from jsonb_array_elements(n->'prerequisites') p where jsonb_typeof(p)<>'string') then raise exception 'NEXUS_ADMIN_PREREQUISITES';end if;
  select coalesce(array_agg(p),'{}') into ids from jsonb_array_elements_text(n->'prerequisites') p;
  if cardinality(ids)<>(select count(distinct p) from unnest(ids) p) or (n->>'id')=any(ids) or exists(select 1 from unnest(ids) p where not(p=any(all_ids))) then raise exception 'NEXUS_ADMIN_PREREQUISITES';end if;
  if exists(select 1 from kizuna_private.kizuna_nexus_nodes z where z.id=n->>'id' and z.tier>1 and not((z.branch||'_'||(z.tier-1))=any(ids))) then raise exception 'NEXUS_ADMIN_PREREQUISITES';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(v->'nodes') a cross join lateral jsonb_array_elements_text(a->'prerequisites') p
  join jsonb_array_elements(v->'nodes') b on b->>'id'=p where (a->>'requiredLevel')::integer<(b->>'requiredLevel')::integer) then raise exception 'NEXUS_ADMIN_LEVEL_ORDER';end if;
 with recursive edges as(select a->>'id' src,p dst from jsonb_array_elements(v->'nodes') a cross join lateral jsonb_array_elements_text(a->'prerequisites') p),
 paths(src,dst) as(select src,dst from edges union select p.src,e.dst from paths p join edges e on e.src=p.dst)
 select exists(select 1 from paths where src=dst) into cycle_found;
 if cycle_found then raise exception 'NEXUS_ADMIN_CYCLE';end if;

 if not kizuna_private.nexus_admin_keys(w,array['name','description','cardIds','enabled']) or not coalesce(kizuna_private.nexus_admin_text(w->'name',3,60),false)
 or not coalesce(kizuna_private.nexus_admin_text(w->'description',0,300),false) or jsonb_typeof(w->'enabled') is distinct from 'boolean' or jsonb_typeof(w->'cardIds') is distinct from 'array' then raise exception 'NEXUS_ADMIN_WEEKLY_POOL';end if;
 if jsonb_array_length(w->'cardIds') not between 6 and 500 or exists(select 1 from jsonb_array_elements(w->'cardIds') p where jsonb_typeof(p)<>'string') then raise exception 'NEXUS_ADMIN_WEEKLY_POOL';end if;
 select array_agg(p order by p) into ids from jsonb_array_elements_text(w->'cardIds') p;
 if cardinality(ids)<>(select count(distinct p) from unnest(ids) p) or exists(select 1 from unnest(ids) p where not exists(select 1 from public.kizuna_cards c where c.id=p))
 or exists(select 1 from public.kizuna_cards c where c.id=any(ids) and kizuna_private.econ_level(c.card->>'rarity') not between 1 and 6)
 or (select count(distinct kizuna_private.econ_level(c.card->>'rarity')) from public.kizuna_cards c where c.id=any(ids))<>6 then raise exception 'NEXUS_ADMIN_WEEKLY_POOL';end if;

 if jsonb_typeof(v->'cosmetics') is distinct from 'array' then raise exception 'NEXUS_ADMIN_COSMETICS';end if;
 if jsonb_array_length(v->'cosmetics')<>(select count(*) from kizuna_private.kizuna_nexus_cosmetics) then raise exception 'NEXUS_ADMIN_COSMETICS';end if;
 seen:='{}';
 for x in select value from jsonb_array_elements(v->'cosmetics') loop
  if not kizuna_private.nexus_admin_keys(x,array['id','name','cost','enabled']) or jsonb_typeof(x->'id') is distinct from 'string' or not exists(select 1 from kizuna_private.kizuna_nexus_cosmetics c where c.id=x->>'id')
   or x->>'id'=any(seen) or not coalesce(kizuna_private.nexus_admin_text(x->'name',2,80),false) or not kizuna_private.nexus_admin_int(x->'cost',1,100000) or jsonb_typeof(x->'enabled') is distinct from 'boolean' then raise exception 'NEXUS_ADMIN_COSMETICS';end if;
  seen:=array_append(seen,x->>'id');
 end loop;
 if jsonb_typeof(v->'albums') is distinct from 'array' then raise exception 'NEXUS_ADMIN_ALBUMS';end if;
 if jsonb_array_length(v->'albums')<>(select count(*) from kizuna_private.kizuna_nexus_album_rewards) then raise exception 'NEXUS_ADMIN_ALBUMS';end if;
 seen:='{}';
 for x in select value from jsonb_array_elements(v->'albums') loop
  if not kizuna_private.nexus_admin_keys(x,array['id','name','chakra','packs','enabled']) or jsonb_typeof(x->'id') is distinct from 'string' or not exists(select 1 from kizuna_private.kizuna_nexus_album_rewards a where a.id=x->>'id')
   or x->>'id'=any(seen) or not coalesce(kizuna_private.nexus_admin_text(x->'name',2,120),false) or not kizuna_private.nexus_admin_int(x->'chakra',0,10000) or not kizuna_private.nexus_admin_int(x->'packs',0,100)
   or jsonb_typeof(x->'enabled') is distinct from 'boolean' then raise exception 'NEXUS_ADMIN_ALBUMS';end if;
  seen:=array_append(seen,x->>'id');
 end loop;
 normalized:=jsonb_build_object('economy',e,'weeklyBooster',jsonb_build_object('name',btrim(w->>'name'),'description',w->>'description','cardIds',ids,'enabled',w->'enabled'),
  'nodes',(select jsonb_agg(jsonb_set(jsonb_set(elt.value,'{name}',to_jsonb(btrim(elt.value->>'name'))),'{prerequisites}',(select coalesce(jsonb_agg(p order by p),'[]') from jsonb_array_elements_text(elt.value->'prerequisites') p)) order by elt.value->>'id') from jsonb_array_elements(v->'nodes') elt),
  'cosmetics',(select jsonb_agg(jsonb_set(elt.value,'{name}',to_jsonb(btrim(elt.value->>'name'))) order by elt.value->>'id') from jsonb_array_elements(v->'cosmetics') elt),
  'albums',(select coalesce(jsonb_agg(jsonb_set(elt.value,'{name}',to_jsonb(btrim(elt.value->>'name'))) order by elt.value->>'id'),'[]') from jsonb_array_elements(v->'albums') elt));
 return normalized;
end; $$;

-- Derive player-facing descriptions and values from the same published economics.
create function kizuna_private.nexus_admin_sum(v jsonb,n integer) returns integer language sql immutable security invoker set search_path='' as $$
 select coalesce(sum((x#>>'{}')::integer),0)::integer from jsonb_array_elements(v) with ordinality q(x,pos) where pos<=n;
$$;
create function kizuna_private.nexus_admin_node_details(node_id text,e jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare description text;kind text;value jsonb;amount integer;
begin
 case node_id
 when 'invocation_1','invocation_3','invocation_5' then
  amount:=kizuna_private.nexus_admin_sum(e->'dailyBoosters',case node_id when 'invocation_1' then 1 when 'invocation_3' then 2 else 3 end);
  description:=amount||' boosters supplémentaires quotidiens au total. Une récupération par jour, à minuit heure de Paris.';kind:='dailyPacks';value:=to_jsonb(amount);
 when 'invocation_2','invocation_4' then
  amount:=kizuna_private.nexus_admin_sum(e->'storageBonuses',case node_id when 'invocation_2' then 1 else 2 end);
  description:='Capacité de recharge : '||(100+amount)||' boosters. Les exemplaires déjà en réserve restent conservés.';kind:='storageBonus';value:=to_jsonb(amount);
 when 'destin_1','destin_3' then
  amount:=kizuna_private.nexus_admin_sum(e->'priorityBonuses',case node_id when 'destin_1' then 1 else 2 end);
  description:=amount||' suivis prioritaires persistants au total, en complément de ta liste d’envies et des alertes existantes.';kind:='prioritySlots';value:=to_jsonb(amount);
 when 'destin_2' then description:='Consulte tes statistiques réelles de tirage, les poids de rareté et tes garanties.';kind:='detailedStats';value:='true';
 when 'destin_4' then description:='Un tableau des annonces actives correspondant à tes priorités.';kind:='marketWatch';value:='true';
 when 'destin_5' then
  amount:=kizuna_private.nexus_admin_sum(e->'priorityBonuses',3);description:=amount||' priorités et un bilan de ta wishlist : cartes manquantes, Mythiques et Éveils. Les chances de tirage restent identiques.';kind:='advancedTracking';value:='true';
 when 'resonance_1' then description:='Une galerie dédiée à tes cartes Mythiques possédées et éveillées.';kind:='awakenedGallery';value:='true';
 when 'resonance_2','resonance_4' then
  amount:=case node_id when 'resonance_2' then (e->>'fragmentsBasic')::integer else (e->>'fragmentsAdvanced')::integer end;
  description:=amount||' fragments cosmétiques par doublon Mythique tiré, dans la limite de '||(e->>'fragmentsDailyCap')||' fragments Nexus par jour.';kind:='fragmentsPerDuplicate';value:=to_jsonb(amount);
 when 'resonance_3' then description:='Une animation exclusive lorsque ton tirage accorde une Résonance Mythique.';kind:='resonanceAnimation';value:='true';
 when 'resonance_5' then description:='Une présentation prestige pour tes Mythiques entièrement éveillées. Aucun Éveil supplémentaire.';kind:='mythicPrestige';value:='true';
 when 'collection_1','collection_3','collection_5' then
  amount:=least((e->>'recycleCapBps')::integer,kizuna_private.nexus_admin_sum(e->'recycleBonuses',case node_id when 'collection_1' then 1 when 'collection_3' then 2 else 3 end));
  description:=trim(trailing '.' from trim(trailing '0' from to_char(amount/100.0,'FM990.00')))||' % de Chakra supplémentaires sur les doublons recyclés au total. Les fractions sont conservées.';kind:='recycleBps';value:=to_jsonb(amount);
 when 'collection_2' then description:='Enregistre tes filtres d’album, rareté, doublons ou cartes manquantes et ton tri préféré.';kind:='archiveTools';value:='true';
 when 'collection_4' then description:='Récompenses de Chakra et boosters pour les albums définis. Consulte les montants de chaque album dans le coffre ; une seule récupération par album.';kind:='albumRewards';value:='true';
 when 'prestige_1' then description:='Un cadre de profil Nexus exclusif, à équiper à ta convenance.';kind:='profileFrame';value:='"nexus"';
 when 'prestige_2' then description:=(e->>'prestigeDailyChakra')||' Chakra supplémentaires à récupérer chaque jour à minuit heure de Paris.';kind:='prestigeDailyChakra';value:=e->'prestigeDailyChakra';
 when 'prestige_3','prestige_4' then
  amount:=case node_id when 'prestige_3' then (e->>'weeklyBasic')::integer else (e->>'weeklyAdvanced')::integer end;
  description:=amount||' Coffrets Nexus hebdomadaires au total, disponibles le lundi à minuit heure de Paris. Même moteur de tirage Kizuna.';kind:='weeklyPacks';value:=to_jsonb(amount);
 when 'prestige_5' then description:='Titre Légende KIZUNA, profil animé, cristal prestige et récompense unique de '||(e->>'prestigeOnceChakra')||' Chakra et '||(e->>'prestigeOncePacks')||' boosters ordinaires.';kind:='prestigeLegend';value:='true';
 else raise exception 'NEXUS_ADMIN_INVALID_NODES';end case;
 return jsonb_build_object('description',description,'effect',jsonb_build_object('type',kind,'value',value));
end; $$;

-- Keep existing math and entitlement semantics, making only its three increments configurable.
do $$declare d text;begin
 d:=pg_get_functiondef('kizuna_private.nexus_bonuses(uuid)'::regprocedure);
 d:=kizuna_private.nexus_lot_two_patch_once(d,'''collection_1''=any(ids) then 500 else 0 end','''collection_1''=any(ids) then recycle_bonuses[1] else 0 end');
 d:=kizuna_private.nexus_lot_two_patch_once(d,'''collection_3''=any(ids) then 500 else 0 end','''collection_3''=any(ids) then recycle_bonuses[2] else 0 end');
 d:=kizuna_private.nexus_lot_two_patch_once(d,'''collection_5''=any(ids) then 500 else 0 end','''collection_5''=any(ids) then recycle_bonuses[3] else 0 end');
 execute d;
end; $$;
create or replace function kizuna_private.nexus_refresh_stock(u uuid,st jsonb,nowms bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cap integer:=(kizuna_private.nexus_bonuses(u)->>'freeCapacity')::integer;free_n integer:=coalesce((st->>'free')::integer,3);elapsed integer;t bigint:=coalesce((st->>'t')::bigint,nowms);
begin
 -- An administrator lowering the recharge capacity never deletes earned packs.
 if free_n>=cap then t:=nowms;
 else
  elapsed:=least(cap,greatest(0,floor((nowms-t)/21600000.0)::integer));free_n:=least(cap,free_n+elapsed);
  t:=case when free_n=cap then nowms else t+elapsed::bigint*21600000 end;
 end if;
 return st||jsonb_build_object('free',free_n,'t',t,'freeCapacity',cap,'nexusWeekly',coalesce((st->>'nexusWeekly')::bigint,0));
end; $$;

create function kizuna_private.nexus_admin_apply(v jsonb,new_version integer) returns void language plpgsql security invoker set search_path='' as $$
declare e jsonb:=v->'economy';w jsonb:=v->'weeklyBooster';x jsonb;details jsonb;begin
 update kizuna_private.kizuna_nexus_config c set
 daily_boosters=array(select value::integer from jsonb_array_elements_text(e->'dailyBoosters')),
 storage_bonuses=array(select value::integer from jsonb_array_elements_text(e->'storageBonuses')),
 priority_bonuses=array(select value::integer from jsonb_array_elements_text(e->'priorityBonuses')),
 recycle_bonuses=array(select value::integer from jsonb_array_elements_text(e->'recycleBonuses')),
 recycle_cap_bps=(e->>'recycleCapBps')::integer,fragments_basic=(e->>'fragmentsBasic')::integer,fragments_advanced=(e->>'fragmentsAdvanced')::integer,
 fragments_daily_cap=(e->>'fragmentsDailyCap')::integer,prestige_daily_chakra=(e->>'prestigeDailyChakra')::integer,
 weekly_basic=(e->>'weeklyBasic')::integer,weekly_advanced=(e->>'weeklyAdvanced')::integer,
 prestige_once_chakra=(e->>'prestigeOnceChakra')::integer,prestige_once_packs=(e->>'prestigeOncePacks')::integer,weekly_enabled=(w->>'enabled')::boolean,
 version=new_version,activated_at=now() where c.id;
 for x in select value from jsonb_array_elements(v->'nodes') loop
  details:=kizuna_private.nexus_admin_node_details(x->>'id',e);
  update kizuna_private.kizuna_nexus_nodes n set name=x->>'name',cost=(x->>'cost')::bigint,required_level=(x->>'requiredLevel')::integer,
  prerequisites=array(select value from jsonb_array_elements_text(x->'prerequisites')),enabled=(x->>'enabled')::boolean,description=details->>'description',effect=details->'effect' where n.id=x->>'id';
 end loop;
 update public.kizuna_boosters b set name=w->>'name',description=w->>'description',card_ids=array(select value from jsonb_array_elements_text(w->'cardIds')),published=false,updated_at=now()
 where b.id=(select c.weekly_booster_id from kizuna_private.kizuna_nexus_config c where c.id);
 for x in select value from jsonb_array_elements(v->'cosmetics') loop
  update kizuna_private.kizuna_nexus_cosmetics c set name=x->>'name',cost=(x->>'cost')::integer,enabled=(x->>'enabled')::boolean where c.id=x->>'id';
 end loop;
 for x in select value from jsonb_array_elements(v->'albums') loop
  update kizuna_private.kizuna_nexus_album_rewards a set name=x->>'name',chakra=(x->>'chakra')::integer,packs=(x->>'packs')::integer,enabled=(x->>'enabled')::boolean where a.id=x->>'id';
 end loop;
end; $$;

create function kizuna_private.nexus_admin_stats() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'players',(select count(*) from kizuna_private.kizuna_nexus_progress),
 'activePlayers30d',(select count(distinct user_id) from kizuna_private.kizuna_nexus_xp_events where occurred_at>=now()-interval '30 days'),
 'unlocks',(select count(*) from kizuna_private.kizuna_nexus_unlocks),
 'chakraSpent',(select coalesce(sum(cost),0) from kizuna_private.kizuna_nexus_unlocks),
 'dailyClaims',(select count(*) from kizuna_private.kizuna_nexus_daily_claims),
 'weeklyClaims',(select count(*) from kizuna_private.kizuna_nexus_reward_claims where reward_key='weekly'),
 'albumClaims',(select count(*) from kizuna_private.kizuna_nexus_reward_claims where reward_key like 'album:%'),
 'fragmentsAwarded',(select coalesce(sum(amount),0) from kizuna_private.kizuna_nexus_fragment_events),
 'cosmeticsPurchased',(select count(*) from kizuna_private.kizuna_nexus_cosmetic_unlocks),
 'granted',(select jsonb_build_object('chakra',coalesce(sum((result->>'chakra')::bigint),0),'packs',coalesce(sum((result->>'rolls')::bigint),0),'weeklyPacks',coalesce(sum((result->>'weeklyPacks')::bigint),0)) from kizuna_private.kizuna_economy_receipts where action in('nexus_daily','nexus_reward')),
 'nodes',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'count',coalesce(x.n,0),'chakraSpent',coalesce(x.spent,0)) order by n.branch,n.tier),'[]') from kizuna_private.kizuna_nexus_nodes n
 left join(select node_id,count(*) n,sum(cost) spent from kizuna_private.kizuna_nexus_unlocks group by node_id)x on x.node_id=n.id),
 'branches',(select jsonb_agg(jsonb_build_object('id',b,'unlocks',coalesce(x.n,0),'chakraSpent',coalesce(x.spent,0),
 'completedPlayers',(select count(*) from(select u.user_id from kizuna_private.kizuna_nexus_unlocks u join kizuna_private.kizuna_nexus_nodes n on n.id=u.node_id where n.branch=b group by u.user_id having count(*)=5)z)) order by b)
 from unnest(array['invocation','destin','resonance','collection','prestige']) b left join(select n.branch,count(*) n,sum(u.cost) spent from kizuna_private.kizuna_nexus_unlocks u join kizuna_private.kizuna_nexus_nodes n on n.id=u.node_id group by n.branch)x on x.branch=b),
 'generatedAt',floor(extract(epoch from now())*1000));
$$;

create function kizuna_private.nexus_admin_changes(old_config jsonb,new_config jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare changes jsonb:='[]';s text;k text;x jsonb;previous jsonb;begin
 foreach s in array array['economy','weeklyBooster'] loop
  for k in select jsonb_object_keys(new_config->s) loop
   if old_config#>array[s,k] is distinct from new_config#>array[s,k] then changes:=changes||jsonb_build_array(jsonb_build_object('path',s||'.'||k,'before',old_config#>array[s,k],'after',new_config#>array[s,k]));end if;
  end loop;
 end loop;
 foreach s in array array['nodes','cosmetics','albums'] loop
  for x in select value from jsonb_array_elements(new_config->s) loop
   select o into previous from jsonb_array_elements(old_config->s) o where o->>'id'=x->>'id';
   for k in select jsonb_object_keys(x) loop
    if k<>'id' and previous->k is distinct from x->k then changes:=changes||jsonb_build_array(jsonb_build_object('path',s||'.'||(x->>'id')||'.'||k,'before',previous->k,'after',x->k));end if;
   end loop;
  end loop;
 end loop;
 return changes;
end; $$;

create function kizuna_private.nexus_admin_preview(v jsonb,draft_revision bigint,live_version integer) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e jsonb:=v->'economy';warnings jsonb:='[]';live jsonb:=kizuna_private.nexus_admin_document();changes jsonb;begin
 changes:=kizuna_private.nexus_admin_changes(live,v);
 if kizuna_private.nexus_admin_sum(e->'storageBonuses',2)<kizuna_private.nexus_admin_sum(live#>'{economy,storageBonuses}',2) then warnings:=warnings||'"La capacité de recharge baisse ; les packs déjà en stock seront conservés."'::jsonb;end if;
 if kizuna_private.nexus_admin_sum(e->'priorityBonuses',3)<kizuna_private.nexus_admin_sum(live#>'{economy,priorityBonuses}',3) then warnings:=warnings||'"Les priorités déjà enregistrées restent conservées ; la nouvelle limite s’applique aux prochaines modifications."'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(v->'nodes') n where not (n->>'enabled')::boolean) then warnings:=warnings||'"Les nœuds désactivés ne peuvent plus être achetés. Les achats déjà acquis restent valables."'::jsonb;end if;
 if (e->>'fragmentsDailyCap')::integer<(e->>'fragmentsAdvanced')::integer then warnings:=warnings||'"Le plafond quotidien limite le gain de fragments par doublon."'::jsonb;end if;
 if jsonb_array_length(changes)>0 then warnings:=warnings||'"Les cadeaux déjà récupérés ne seront pas attribués à nouveau, même après restauration d’une version."'::jsonb;end if;
 return jsonb_build_object('hash',md5(jsonb_build_object('revision',draft_revision,'version',live_version,'config',v)::text),
 'changes',changes,'warnings',warnings,'summary',jsonb_build_object('dailyPacks',kizuna_private.nexus_admin_sum(e->'dailyBoosters',3),'freeCapacity',100+kizuna_private.nexus_admin_sum(e->'storageBonuses',2),
 'prioritySlots',kizuna_private.nexus_admin_sum(e->'priorityBonuses',3),'recycleBps',least((e->>'recycleCapBps')::integer,kizuna_private.nexus_admin_sum(e->'recycleBonuses',3)),
 'weeklyPacks',(e->>'weeklyAdvanced')::integer));
end; $$;

insert into kizuna_private.kizuna_nexus_admin_draft(draft)
select kizuna_private.nexus_admin_validate(kizuna_private.nexus_admin_document());
insert into kizuna_private.kizuna_nexus_admin_history(version,revision,config,action)
select c.version,d.revision,d.draft,'initial' from kizuna_private.kizuna_nexus_config c cross join kizuna_private.kizuna_nexus_admin_draft d where c.id and d.id;

-- The legacy staff booster editor must not bypass Nexus versioning.
-- A publication inserts its immutable history first, then applies exactly that document.
create or replace function kizuna_private.nexus_weekly_publication_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare authorized jsonb;begin
 if not exists(select 1 from kizuna_private.kizuna_nexus_config c where c.id and c.weekly_booster_id=old.id) then return new;end if;
 select h.config->'weeklyBooster' into authorized from kizuna_private.kizuna_nexus_config c join kizuna_private.kizuna_nexus_admin_history h on h.version=c.version where c.id;
 if authorized is null or new.id<>old.id or new.published or new.name is distinct from authorized->>'name' or new.description is distinct from authorized->>'description'
  or array(select p from unnest(new.card_ids) p order by p) is distinct from array(select value from jsonb_array_elements_text(authorized->'cardIds')) then raise exception 'NEXUS_WEEKLY_MANAGED';end if;
 return new;
end; $$;
drop trigger kizuna_nexus_weekly_publication on public.kizuna_boosters;
create trigger kizuna_nexus_weekly_publication before update on public.kizuna_boosters for each row execute function kizuna_private.nexus_weekly_publication_guard();

create function kizuna_private.nexus_admin_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('draft',d.draft,'revision',d.revision,'publishedVersion',c.version,'publishedRevision',d.published_revision,
 'live',kizuna_private.nexus_admin_document(),'history',
 (select coalesce(jsonb_agg(jsonb_build_object('version',h.version,'revision',h.revision,'action',h.action,'createdAt',h.created_at,'actorName',coalesce(p.username,'Installation')) order by h.version desc),'[]')
  from(select * from kizuna_private.kizuna_nexus_admin_history order by version desc limit 30) h left join public.kizuna_profiles p on p.id=h.actor),
 'stats',kizuna_private.nexus_admin_stats(),'bounds',jsonb_build_object(
 'nodeCost',array[1,1000000000],'nodeLevel',array[1,10000],'dailyPacksMax',4,'storageBonusMax',3,'prioritySlotsMax',20,'recycleBpsMax',1500,
 'fragmentsPerDuplicateMax',10,'fragmentsDailyMax',100,'dailyChakraMax',1000,'weeklyBasicMax',5,'weeklyAdvancedMax',10,'onceChakraMax',100000,'oncePacksMax',1000,
 'cosmeticCost',array[1,100000],'albumChakraMax',10000,'albumPacksMax',100,'weeklyCards',array[6,500]),
 'serverNow',floor(extract(epoch from now())*1000))
 from kizuna_private.kizuna_nexus_admin_draft d cross join kizuna_private.kizuna_nexus_config c where d.id and c.id;
$$;

-- One public invoker wrapper; its private definer gate checks the current protected role.
create function kizuna_private.kizuna_nexus_admin(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_value uuid:=auth.uid();d kizuna_private.kizuna_nexus_admin_draft;v jsonb;preview jsonb;cv integer;new_version integer;req uuid;request_hash text;receipt kizuna_private.kizuna_nexus_admin_receipts;outcome jsonb;
begin
 if actor_value is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.kizuna_admins a where a.user_id=actor_value) then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>310000 then raise exception 'INVALID_INPUT';end if;
 if p_action not in('get','save','preview','publish','restore') or p_action is null then raise exception 'INVALID_ACTION';end if;
 if p_action='get' then
  if p_payload<>'{}'::jsonb then raise exception 'INVALID_INPUT';end if;
  return kizuna_private.nexus_admin_snapshot();
 end if;
 -- Same ordering as economic operations. A publish cannot split a draw or reward claim.
 perform pg_advisory_xact_lock(17493,700);
 -- Recheck after waiting on the lock so a staff-role change takes effect immediately.
 if not exists(select 1 from public.kizuna_admins a where a.user_id=actor_value) then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select * into strict d from kizuna_private.kizuna_nexus_admin_draft x where x.id for update;
 select c.version into strict cv from kizuna_private.kizuna_nexus_config c where c.id;
 if p_action='save' then
  if not kizuna_private.nexus_admin_keys(p_payload,array['revision','config']) then raise exception 'INVALID_INPUT';end if;
 elsif p_action='preview' then
  if not kizuna_private.nexus_admin_keys(p_payload,array['revision']) then raise exception 'INVALID_INPUT';end if;
 elsif p_action='restore' then
  if not kizuna_private.nexus_admin_keys(p_payload,array['revision','targetVersion']) or not kizuna_private.nexus_admin_int(p_payload->'targetVersion',1,2147483646) then raise exception 'INVALID_INPUT';end if;
 else
  if not kizuna_private.nexus_admin_keys(p_payload,array['revision','expectedVersion','requestId','previewHash'])
   or not kizuna_private.nexus_admin_int(p_payload->'expectedVersion',1,2147483646)
   or jsonb_typeof(p_payload->'requestId') is distinct from 'string' or coalesce(p_payload->>'requestId','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
   or jsonb_typeof(p_payload->'previewHash') is distinct from 'string' then raise exception 'INVALID_INPUT';end if;
  req:=(p_payload->>'requestId')::uuid;request_hash:=md5(p_payload::text);
  select * into receipt from kizuna_private.kizuna_nexus_admin_receipts r where r.actor=actor_value and r.request_id=req;
  if found then
   if receipt.payload_hash<>request_hash then raise exception 'REQUEST_REUSED';end if;
   return kizuna_private.nexus_admin_snapshot()||jsonb_build_object('replayed',true,'operation',jsonb_build_object('publishedVersion',receipt.version));
  end if;
 end if;
 if not kizuna_private.nexus_admin_int(p_payload->'revision',1,9007199254740991) or (p_payload->>'revision')::bigint<>d.revision then raise exception 'REVISION_CONFLICT';end if;
 if p_action='save' then
  v:=kizuna_private.nexus_admin_validate(p_payload->'config');
  if v is not distinct from d.draft then return kizuna_private.nexus_admin_snapshot();end if;
  update kizuna_private.kizuna_nexus_admin_draft x set draft=v,revision=x.revision+1,updated_at=now(),updated_by=actor_value where x.id returning * into d;
 elsif p_action='restore' then
  select h.config into v from kizuna_private.kizuna_nexus_admin_history h where h.version=(p_payload->>'targetVersion')::integer;
  if v is null then raise exception 'VERSION_NOT_FOUND';end if;
  v:=kizuna_private.nexus_admin_validate(v);
  update kizuna_private.kizuna_nexus_admin_draft x set draft=v,revision=x.revision+1,updated_at=now(),updated_by=actor_value where x.id returning * into d;
 else
  v:=kizuna_private.nexus_admin_validate(d.draft);preview:=kizuna_private.nexus_admin_preview(v,d.revision,cv);
  if p_action='preview' then return kizuna_private.nexus_admin_snapshot()||jsonb_build_object('preview',preview);end if;
  if (p_payload->>'expectedVersion')::integer<>cv then raise exception 'NEXUS_CONFIG_CHANGED';end if;
  if p_payload->>'previewHash' is distinct from preview->>'hash' then raise exception 'NEXUS_ADMIN_PREVIEW_REQUIRED';end if;
  if jsonb_array_length(preview->'changes')=0 then raise exception 'NEXUS_ADMIN_NO_CHANGES';end if;
  if cv>=2147483646 then raise exception 'NEXUS_ADMIN_BOUNDS';end if;
  new_version:=cv+1;
  insert into kizuna_private.kizuna_nexus_admin_history(version,revision,config,actor,action,summary) values(new_version,d.revision+1,v,actor_value,'publish',preview->'summary');
  perform kizuna_private.nexus_admin_apply(v,new_version);
  update kizuna_private.kizuna_nexus_admin_draft x set draft=v,revision=x.revision+1,published_revision=x.revision+1,updated_at=now(),updated_by=actor_value where x.id returning * into d;
  insert into kizuna_private.kizuna_nexus_admin_receipts(actor,request_id,payload_hash,version) values(actor_value,req,request_hash,new_version);
 end if;
 insert into private.kizuna_staff_audit(actor_id,action,details) values(actor_value,'nexus_'||p_action,jsonb_build_object('revision',d.revision,'version',coalesce(new_version,cv),'targetVersion',p_payload->'targetVersion'));
 outcome:=kizuna_private.nexus_admin_snapshot();
 if p_action='publish' then outcome:=outcome||jsonb_build_object('replayed',false,'operation',jsonb_build_object('publishedVersion',new_version));end if;
 return outcome;
end; $$;
create function public.kizuna_nexus_admin(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select kizuna_private.kizuna_nexus_admin(p_action,p_payload);
$$;

-- Helpers cannot be invoked by a browser; only the role-checked private entrypoint can.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='kizuna_private' and p.proname like 'nexus_admin_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
revoke all on function kizuna_private.kizuna_nexus_admin(text,jsonb),public.kizuna_nexus_admin(text,jsonb) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_nexus_admin(text,jsonb),public.kizuna_nexus_admin(text,jsonb) to authenticated;
notify pgrst,'reload schema';
