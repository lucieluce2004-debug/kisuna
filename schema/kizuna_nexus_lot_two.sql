-- Nexus lot 2: execute the complete file in one transaction after kizuna_nexus.sql.
-- No reset of inventory, Chakra, XP, stock, pity, Mythics or previously earned upgrades.
select pg_advisory_xact_lock(17493,700);
do $$begin
 if (select version from kizuna_private.kizuna_nexus_config where id) is distinct from 1 then raise exception 'NEXUS_LOT_TWO_VERSION';end if;
end; $$;

create table kizuna_private.kizuna_nexus_lot_two_backup(
 id boolean primary key default true check(id),captured_at timestamptz not null default now(),
 functions jsonb not null,states jsonb not null,adventure jsonb not null,config jsonb not null,nodes jsonb not null,progress jsonb not null
);
insert into kizuna_private.kizuna_nexus_lot_two_backup(functions,states,adventure,config,nodes,progress)
select (select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='kizuna_private' and p.proname in('kizuna_economy','econ_write','nexus_mutate','nexus_snapshot','nexus_bonuses')),
 (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.kizuna_player_states x),
 (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from kizuna_private.kizuna_adventure_players x),
 (select to_jsonb(x) from kizuna_private.kizuna_nexus_config x where id),
 (select jsonb_agg(to_jsonb(x)) from kizuna_private.kizuna_nexus_nodes x),
 (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from kizuna_private.kizuna_nexus_progress x);

alter table kizuna_private.kizuna_nexus_config
 add column daily_boosters integer[] not null default array[1,1,2] check(cardinality(daily_boosters)=3 and daily_boosters[1] between 0 and 4 and daily_boosters[2] between 0 and 4 and daily_boosters[3] between 0 and 4 and daily_boosters[1]+daily_boosters[2]+daily_boosters[3]<=4),
 add column storage_bonuses integer[] not null default array[1,2] check(cardinality(storage_bonuses)=2 and storage_bonuses[1] between 0 and 3 and storage_bonuses[2] between 0 and 3 and storage_bonuses[1]+storage_bonuses[2]<=3),
 add column priority_bonuses integer[] not null default array[5,10,5] check(cardinality(priority_bonuses)=3 and priority_bonuses[1] between 0 and 20 and priority_bonuses[2] between 0 and 20 and priority_bonuses[3] between 0 and 20 and priority_bonuses[1]+priority_bonuses[2]+priority_bonuses[3]<=20),
 add column fragments_basic integer not null default 1 check(fragments_basic between 0 and 10),
 add column fragments_advanced integer not null default 2 check(fragments_advanced between 0 and 10),
 add column fragments_daily_cap integer not null default 10 check(fragments_daily_cap between 0 and 100),
 add column prestige_daily_chakra integer not null default 25 check(prestige_daily_chakra between 0 and 1000),
 add column weekly_basic integer not null default 1 check(weekly_basic between 0 and 5),
 add column weekly_advanced integer not null default 2 check(weekly_advanced between 0 and 10),
 add column prestige_once_chakra integer not null default 1000 check(prestige_once_chakra between 0 and 100000),
 add column prestige_once_packs integer not null default 5 check(prestige_once_packs between 0 and 1000),
 add column weekly_booster_id uuid references public.kizuna_boosters(id),
 add column weekly_enabled boolean not null default true,
 add constraint nexus_advanced_fragment_bonus check(fragments_advanced>=fragments_basic),
 add constraint nexus_advanced_weekly_bonus check(weekly_advanced>=weekly_basic),
 add constraint nexus_bonus_arrays check(
  array_ndims(daily_boosters)=1 and array_lower(daily_boosters,1)=1 and array_position(daily_boosters,null) is null
  and array_ndims(storage_bonuses)=1 and array_lower(storage_bonuses,1)=1 and array_position(storage_bonuses,null) is null
  and array_ndims(priority_bonuses)=1 and array_lower(priority_bonuses,1)=1 and array_position(priority_bonuses,null) is null);
create index kizuna_nexus_weekly_booster on kizuna_private.kizuna_nexus_config(weekly_booster_id);
do $$declare k record;found_count integer:=0;begin
 for k in select conname from pg_constraint where conrelid='kizuna_private.kizuna_nexus_progress'::regclass and contype='c' and pg_get_constraintdef(oid) like '%cardinality(priority_card_ids)%' loop
  found_count:=found_count+1;
  execute format('alter table kizuna_private.kizuna_nexus_progress drop constraint %I',k.conname);
 end loop;
 if found_count<>1 then raise exception 'NEXUS_PRIORITY_CONSTRAINT_ANCHOR';end if;
end; $$;
alter table kizuna_private.kizuna_nexus_progress
 add constraint nexus_priority_capacity check(cardinality(priority_card_ids)<=20),
 add column aura text not null default '' check(aura in('','echo','astral','transcendance')),
 add column archive_preferences jsonb not null default '{"series":"","rarity":"","mode":"all","sort":"name"}' check(jsonb_typeof(archive_preferences)='object');

create table kizuna_private.kizuna_nexus_reward_claims(
 user_id uuid not null references public.kizuna_profiles(id) on delete cascade,reward_key text not null check(char_length(reward_key) between 1 and 180),
 period_key text not null check(period_key='once' or period_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),result jsonb not null,
 claimed_at timestamptz not null default now(),primary key(user_id,reward_key,period_key)
);
create table kizuna_private.kizuna_nexus_album_rewards(
 id text primary key,name text not null,card_ids text[] not null check(cardinality(card_ids) between 5 and 5000),
 chakra integer not null default 100 check(chakra between 0 and 10000),packs integer not null default 1 check(packs between 0 and 100),
 enabled boolean not null default true,created_at timestamptz not null default now()
);
-- Managed albums override implicit series albums with the same normalized name.
insert into kizuna_private.kizuna_nexus_album_rewards(id,name,card_ids)
select 'managed:'||a.id,a.name,array_agg(distinct c.id order by c.id) from public.kizuna_albums a
 join public.kizuna_album_cards m on m.album_id=a.id join public.kizuna_cards c on c.id=m.card_id
group by a.id,a.name having count(distinct c.id)>=5;
insert into kizuna_private.kizuna_nexus_album_rewards(id,name,card_ids)
select 'series:'||md5(lower(btrim(c.card->>'series'))),min(btrim(c.card->>'series')),array_agg(c.id order by c.id)
from public.kizuna_cards c where btrim(coalesce(c.card->>'series',''))<>''
 and not exists(select 1 from public.kizuna_albums a where lower(btrim(a.name))=lower(btrim(c.card->>'series')))
group by lower(btrim(c.card->>'series')) having count(*)>=5;
create table kizuna_private.kizuna_nexus_cosmetics(
 id text primary key check(id in('echo','astral','transcendance')),name text not null,cost integer not null check(cost between 1 and 100000),enabled boolean not null default true
);
insert into kizuna_private.kizuna_nexus_cosmetics(id,name,cost) values('echo','Écho de cristal',20),('astral','Aura astrale',50),('transcendance','Transcendance',100);
create table kizuna_private.kizuna_nexus_cosmetic_unlocks(
 user_id uuid not null references public.kizuna_profiles(id) on delete cascade,cosmetic_id text not null references kizuna_private.kizuna_nexus_cosmetics(id),
 cost integer not null check(cost>0),created_at timestamptz not null default now(),primary key(user_id,cosmetic_id)
);
create index kizuna_nexus_cosmetic_id on kizuna_private.kizuna_nexus_cosmetic_unlocks(cosmetic_id,user_id);
create table kizuna_private.kizuna_nexus_fragment_events(
 user_id uuid not null references public.kizuna_profiles(id) on delete cascade,request_id uuid not null,ordinal integer not null,
 period_key date not null,amount integer not null check(amount between 0 and 10),created_at timestamptz not null default now(),
 primary key(user_id,request_id,ordinal),foreign key(user_id,request_id,ordinal) references kizuna_private.kizuna_draw_journal(user_id,request_id,ordinal)
);
create index kizuna_nexus_fragment_period on kizuna_private.kizuna_nexus_fragment_events(user_id,period_key);
do $$declare t text;begin
 foreach t in array array['kizuna_nexus_lot_two_backup','kizuna_nexus_reward_claims','kizuna_nexus_album_rewards','kizuna_nexus_cosmetics','kizuna_nexus_cosmetic_unlocks','kizuna_nexus_fragment_events'] loop
  execute format('alter table kizuna_private.%I enable row level security',t);
  execute format('revoke all on kizuna_private.%I from public,anon,authenticated',t);
  execute format('grant all on kizuna_private.%I to service_role',t);
  execute format('create policy nexus_service_access on kizuna_private.%I for all to service_role using(true) with check(true)',t);
 end loop;
end; $$;

-- A real dedicated booster: <=20 deterministic characters per rarity, <=120 in all.
-- Kept out of public staff packs; only the authenticated Nexus opening path can use it.
do $$declare ids text[];bid uuid;tiers integer;begin
 select array_agg(x.id order by x.tier,x.id),count(distinct x.tier) into ids,tiers from(
  select c.id,kizuna_private.econ_level(c.card->>'rarity') tier,row_number() over(partition by c.card->>'rarity' order by c.id) pos
  from public.kizuna_cards c where kizuna_private.econ_level(c.card->>'rarity') between 1 and 6
 ) x where x.pos<=20;
 if tiers<>6 then raise exception 'NEXUS_WEEKLY_NEEDS_ALL_RARITIES';end if;
 insert into public.kizuna_boosters(name,description,card_ids,published)
 values('Coffret Nexus','Une sélection permanente de six raretés. Mêmes probabilités, garanties et Résonances que les boosters Kizuna.',ids,false) returning id into bid;
 update kizuna_private.kizuna_nexus_config set weekly_booster_id=bid,version=2 where id;
end; $$;
update kizuna_private.kizuna_nexus_nodes set enabled=true,required_level=case when branch='prestige' then (array[1,5,10,15,20])[tier] else required_level end;
update kizuna_private.kizuna_nexus_nodes n set description=v.description,effect=v.effect::jsonb from(values
 ('invocation_2','Un emplacement supplémentaire : jusqu’à 101 boosters de recharge en réserve.','{"type":"storageBonus","value":1}'),
 ('invocation_3','Deux boosters Nexus quotidiens au total. Une récupération par jour, à minuit heure de Paris.','{"type":"dailyPacks","value":2}'),
 ('invocation_4','Trois emplacements supplémentaires au total : jusqu’à 103 boosters de recharge.','{"type":"storageBonus","value":3}'),
 ('invocation_5','Quatre boosters Nexus quotidiens au total.','{"type":"dailyPacks","value":4}'),
 ('destin_2','Consulte tes statistiques réelles de tirage, les poids de rareté et tes garanties.','{"type":"detailedStats","value":true}'),
 ('destin_3','Quinze suivis prioritaires persistants au total.','{"type":"prioritySlots","value":15}'),
 ('destin_4','Un tableau des annonces actives correspondant à tes priorités.','{"type":"marketWatch","value":true}'),
 ('destin_5','Vingt priorités et un bilan de ta wishlist : cartes manquantes, Mythiques et Éveils. Les chances de tirage restent identiques.','{"type":"advancedTracking","value":true}'),
 ('resonance_2','Un fragment cosmétique par doublon Mythique tiré, dans la limite de dix fragments Nexus par jour.','{"type":"fragmentsPerDuplicate","value":1}'),
 ('resonance_3','Une animation exclusive lorsque ton tirage accorde une Résonance Mythique.','{"type":"resonanceAnimation","value":true}'),
 ('resonance_4','Deux fragments cosmétiques par doublon Mythique, toujours dans la limite de dix par jour.','{"type":"fragmentsPerDuplicate","value":2}'),
 ('resonance_5','Une présentation prestige pour tes Mythiques entièrement éveillées. Aucun Éveil supplémentaire.','{"type":"mythicPrestige","value":true}'),
 ('collection_2','Enregistre tes filtres d’album, rareté, doublons ou cartes manquantes et ton tri préféré.','{"type":"archiveTools","value":true}'),
 ('collection_3','10 % de Chakra supplémentaires sur les doublons recyclés au total.','{"type":"recycleBps","value":1000}'),
 ('collection_4','100 Chakra et un booster ordinaire par album de récompense complété. Une seule fois par album défini.','{"type":"albumRewards","value":true}'),
 ('collection_5','15 % de Chakra supplémentaires sur les doublons recyclés au total.','{"type":"recycleBps","value":1500}'),
 ('prestige_2','25 Chakra supplémentaires à récupérer chaque jour à minuit heure de Paris.','{"type":"prestigeDailyChakra","value":25}'),
 ('prestige_3','Un Coffret Nexus à récupérer chaque semaine. Six raretés, garanties et moteur de tirage Kizuna.','{"type":"weeklyPacks","value":1}'),
 ('prestige_4','Deux Coffrets Nexus hebdomadaires au total, disponibles le lundi à minuit heure de Paris.','{"type":"weeklyPacks","value":2}'),
 ('prestige_5','Titre Légende KIZUNA, profil animé, cristal prestige et récompense unique de 1 000 Chakra et cinq boosters ordinaires.','{"type":"prestigeLegend","value":true}')
)v(id,description,effect) where n.id=v.id;

create or replace function kizuna_private.nexus_bonuses(u uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with owned as(select coalesce(array_agg(node_id),'{}') ids from kizuna_private.kizuna_nexus_unlocks where user_id=u),
 calculated as(select c.*,ids,
  case when 'invocation_1'=any(ids) then c.daily_boosters[1] else 0 end+case when 'invocation_3'=any(ids) then c.daily_boosters[2] else 0 end+case when 'invocation_5'=any(ids) then c.daily_boosters[3] else 0 end daily,
  case when 'invocation_2'=any(ids) then c.storage_bonuses[1] else 0 end+case when 'invocation_4'=any(ids) then c.storage_bonuses[2] else 0 end storage,
  case when 'destin_1'=any(ids) then c.priority_bonuses[1] else 0 end+case when 'destin_3'=any(ids) then c.priority_bonuses[2] else 0 end+case when 'destin_5'=any(ids) then c.priority_bonuses[3] else 0 end priorities
  from kizuna_private.kizuna_nexus_config c cross join owned where c.id)
 select jsonb_build_object('dailyPacks',daily,'storageBonus',storage,'freeCapacity',100+storage,'prioritySlots',priorities,
 'recycleBps',least(recycle_cap_bps,case when 'collection_1'=any(ids) then 500 else 0 end+case when 'collection_3'=any(ids) then 500 else 0 end+case when 'collection_5'=any(ids) then 500 else 0 end),
 'awakenedGallery','resonance_1'=any(ids),'profileFrame',case when 'prestige_1'=any(ids) then 'nexus' else '' end,
 'detailedStats','destin_2'=any(ids),'marketWatch','destin_4'=any(ids),'advancedTracking','destin_5'=any(ids),
 'archiveTools','collection_2'=any(ids),'albumRewards','collection_4'=any(ids),
 'fragmentsPerDuplicate',case when 'resonance_4'=any(ids) then fragments_advanced when 'resonance_2'=any(ids) then fragments_basic else 0 end,
 'fragmentsDailyCap',fragments_daily_cap,'resonanceAnimation','resonance_3'=any(ids),'mythicPrestige','resonance_5'=any(ids),
 'prestigeDailyChakra',case when 'prestige_2'=any(ids) then prestige_daily_chakra else 0 end,
 'weeklyPacks',case when 'prestige_4'=any(ids) then weekly_advanced when 'prestige_3'=any(ids) then weekly_basic else 0 end,
 'prestigeTitle',case when 'prestige_5'=any(ids) then 'Légende KIZUNA' else '' end,'profileAnimation','prestige_5'=any(ids),'prestigeCrystal','prestige_5'=any(ids)) from calculated;
$$;
create function kizuna_private.nexus_week_start(p_at timestamptz) returns date language sql stable security invoker set search_path='' as $$
 select date_trunc('week',p_at at time zone 'Europe/Paris')::date;
$$;
create function kizuna_private.nexus_next_week_reset(p_at timestamptz) returns timestamptz language sql stable security invoker set search_path='' as $$
 select ((kizuna_private.nexus_week_start(p_at)+7)::timestamp at time zone 'Europe/Paris');
$$;
create function kizuna_private.nexus_owned_ids(u uuid,s jsonb) returns text[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(x.id),'{}') from(
  select o->>'id' id from jsonb_array_elements(coalesce(s->'owned','[]')) o
  union select card_id from kizuna_private.kizuna_market_listings where seller_id=u and status='active'
 ) x;
$$;
create function kizuna_private.nexus_weekly_definition() returns uuid language plpgsql stable security invoker set search_path='' as $$
declare bid uuid;ids text[];tiers integer;begin
 select b.id,b.card_ids into bid,ids from kizuna_private.kizuna_nexus_config cfg join public.kizuna_boosters b on b.id=cfg.weekly_booster_id where cfg.id and cfg.weekly_enabled;
 if bid is null or cardinality(ids) not between 6 and 500 then raise exception 'NEXUS_WEEKLY_UNAVAILABLE';end if;
 select count(distinct kizuna_private.econ_level(c.card->>'rarity')) into tiers from public.kizuna_cards c where c.id=any(ids);
 if tiers<>6 or exists(select 1 from unnest(ids) x where not exists(select 1 from public.kizuna_cards c where c.id=x)) then raise exception 'NEXUS_WEEKLY_UNAVAILABLE';end if;
 return bid;
end; $$;
create function kizuna_private.nexus_weekly_publication_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.published and exists(select 1 from kizuna_private.kizuna_nexus_config where id and weekly_booster_id=new.id) then raise exception 'NEXUS_WEEKLY_MANAGED';end if;
 return new;
end; $$;
create trigger kizuna_nexus_weekly_publication before update of published on public.kizuna_boosters for each row execute function kizuna_private.nexus_weekly_publication_guard();
create function kizuna_private.nexus_refresh_stock(u uuid,st jsonb,nowms bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cap integer:=(kizuna_private.nexus_bonuses(u)->>'freeCapacity')::integer;free_n integer:=coalesce((st->>'free')::integer,3);elapsed integer;t bigint:=coalesce((st->>'t')::bigint,nowms);
begin
 if free_n>=cap then free_n:=cap;t:=nowms;
 else
  elapsed:=least(cap,greatest(0,floor((nowms-t)/21600000.0)::integer));free_n:=least(cap,free_n+elapsed);
  t:=case when free_n=cap then nowms else t+elapsed::bigint*21600000 end;
 end if;
 return st||jsonb_build_object('free',free_n,'t',t,'freeCapacity',cap,'nexusWeekly',coalesce((st->>'nexusWeekly')::bigint,0));
end; $$;

create function kizuna_private.nexus_fragment_award() returns trigger language plpgsql security invoker set search_path='' as $$
declare b jsonb;day date;earned integer;amount integer;balance integer;inserted integer;s jsonb;
begin
 if new.rarity<>'Mythique' or not new.duplicate then return new;end if;
 perform kizuna_private.nexus_ensure(new.user_id);b:=kizuna_private.nexus_bonuses(new.user_id);
 if (b->>'fragmentsPerDuplicate')::integer<1 then return new;end if;
 day:=(new.occurred_at at time zone 'Europe/Paris')::date;
 select coalesce(sum(e.amount),0) into earned from kizuna_private.kizuna_nexus_fragment_events e where e.user_id=new.user_id and e.period_key=day;
 insert into kizuna_private.kizuna_adventure_players(user_id) values(new.user_id) on conflict do nothing;
 select p.state into s from kizuna_private.kizuna_adventure_players p where p.user_id=new.user_id for update;
 balance:=coalesce((s->>'fragments')::integer,0);
 amount:=greatest(0,least((b->>'fragmentsPerDuplicate')::integer,(b->>'fragmentsDailyCap')::integer-earned,100000-balance));
 insert into kizuna_private.kizuna_nexus_fragment_events(user_id,request_id,ordinal,period_key,amount)
 values(new.user_id,new.request_id,new.ordinal,day,amount) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=1 and amount>0 then
  update kizuna_private.kizuna_adventure_players set state=jsonb_set(s,'{fragments}',to_jsonb(balance+amount)),revision=revision+1,updated_at=now() where user_id=new.user_id;
  update kizuna_private.kizuna_nexus_progress set revision=revision+1,updated_at=now() where user_id=new.user_id;
 end if;
 return new;
end; $$;
create trigger kizuna_nexus_fragments after insert on kizuna_private.kizuna_draw_journal for each row execute function kizuna_private.nexus_fragment_award();

create function kizuna_private.nexus_rewards(u uuid,s jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare b jsonb:=kizuna_private.nexus_bonuses(u);cfg kizuna_private.kizuna_nexus_config;rows jsonb:='[]';r record;a kizuna_private.kizuna_nexus_album_rewards;
 owned_ids text[]:=kizuna_private.nexus_owned_ids(u,s);owned_n integer;claimed boolean;day text:=((now() at time zone 'Europe/Paris')::date)::text;week text:=kizuna_private.nexus_week_start(now())::text;weekly_ok boolean:=true;
begin
 select * into strict cfg from kizuna_private.kizuna_nexus_config where id;
 begin perform kizuna_private.nexus_weekly_definition();exception when others then if sqlerrm='NEXUS_WEEKLY_UNAVAILABLE' then weekly_ok:=false;else raise;end if;end;
 for r in select * from(values
  ('prestige_daily','Éclat quotidien','daily',day,kizuna_private.nexus_next_reset(now()),not exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='prestige_2'),cfg.prestige_daily_chakra,0,0),
  ('weekly','Coffret Nexus hebdomadaire','weekly',week,kizuna_private.nexus_next_week_reset(now()),(b->>'weeklyPacks')::integer<1 or not weekly_ok,0,0,(b->>'weeklyPacks')::integer),
  ('prestige_once','Légende KIZUNA','once','once',null::timestamptz,not exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='prestige_5'),cfg.prestige_once_chakra,cfg.prestige_once_packs,0)
 )v(key,name,kind,period,next_reset,locked,chakra,packs,weekly_packs) loop
  select exists(select 1 from kizuna_private.kizuna_nexus_reward_claims c where c.user_id=u and c.reward_key=r.key and c.period_key=r.period) into claimed;
  rows:=rows||jsonb_build_array(jsonb_build_object('key',r.key,'name',r.name,'kind',r.kind,'periodKey',r.period,'nextResetAt',r.next_reset,'locked',r.locked,'claimed',claimed,
   'available',not r.locked and not claimed and r.chakra+r.packs+r.weekly_packs>0,'chakra',r.chakra,'packs',r.packs,'weeklyPacks',r.weekly_packs));
 end loop;
 for a in select * from kizuna_private.kizuna_nexus_album_rewards where enabled order by name,id loop
  select count(*) into owned_n from unnest(a.card_ids) x where x=any(owned_ids);
  select exists(select 1 from kizuna_private.kizuna_nexus_reward_claims c where c.user_id=u and c.reward_key='album:'||a.id and c.period_key='once') into claimed;
  rows:=rows||jsonb_build_array(jsonb_build_object('key','album:'||a.id,'name',a.name,'kind','album','periodKey','once','nextResetAt',null,
   'locked',not(b->>'albumRewards')::boolean,'claimed',claimed,'available',(b->>'albumRewards')::boolean and not claimed and owned_n=cardinality(a.card_ids) and a.chakra+a.packs>0,
   'chakra',a.chakra,'packs',a.packs,'weeklyPacks',0,'albumId',a.id,'owned',owned_n,'total',cardinality(a.card_ids)));
 end loop;
 return rows;
end; $$;

-- Keep the proven lot-one transaction logic as a private core, lifting only its implemented bounds.
do $$declare d text;anchor text;begin
 d:=pg_get_functiondef('kizuna_private.nexus_mutate(uuid,text,jsonb,jsonb)'::regprocedure);
 anchor:='FUNCTION kizuna_private.nexus_mutate(';
 if (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 or strpos(d,'or n.tier<>1')=0 or strpos(d,'jsonb_array_length(payload->''priorityCardIds'')>5')=0 then raise exception 'NEXUS_LOT_TWO_CORE_ANCHOR';end if;
 d:=replace(d,anchor,'FUNCTION kizuna_private.nexus_mutate_lot_one(');
 d:=replace(d,' or n.tier<>1','');
 d:=replace(d,'jsonb_array_length(payload->''priorityCardIds'')>5','jsonb_array_length(payload->''priorityCardIds'')>20');
 execute d;
end; $$;
create or replace function kizuna_private.nexus_mutate(u uuid,action text,payload jsonb,s jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p kizuna_private.kizuna_nexus_progress;b jsonb;response jsonb;result jsonb:='{}';base_payload jsonb;pref jsonb;aura_value text;reward jsonb;
 key_value text;period_value text;inserted integer;cv integer;cosmetic kizuna_private.kizuna_nexus_cosmetics;adventure jsonb;balance integer;
begin
 if u is distinct from auth.uid() then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT';end if;
 perform kizuna_private.nexus_ensure(u);
 select * into strict p from kizuna_private.kizuna_nexus_progress where user_id=u for update;
 b:=kizuna_private.nexus_bonuses(u);
 if action in('nexus_buy','nexus_daily') then
  response:=kizuna_private.nexus_mutate_lot_one(u,action,payload,s);s:=response->'snapshot';result:=response->'result';
  -- A newly bought storage slot is reflected immediately; it does not mint a booster.
  s:=jsonb_set(s,'{stock,freeCapacity}',kizuna_private.nexus_bonuses(u)->'freeCapacity');
 elsif action='nexus_preferences' then
  if payload='{}'::jsonb or exists(select 1 from jsonb_object_keys(payload) x(k) where k not in('priorityCardIds','frame','aura','archivePreferences')) then raise exception 'INVALID_INPUT';end if;
  base_payload:=payload-'aura'-'archivePreferences';
  if base_payload<>'{}'::jsonb then response:=kizuna_private.nexus_mutate_lot_one(u,action,base_payload,s);s:=response->'snapshot';result:=response->'result';end if;
  pref:=p.archive_preferences;aura_value:=p.aura;
  if payload ? 'archivePreferences' then
   if not(b->>'archiveTools')::boolean then raise exception 'NEXUS_ARCHIVE_LOCKED';end if;
   pref:=payload->'archivePreferences';
   if jsonb_typeof(pref) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
   if (select count(*) from jsonb_object_keys(pref))<>4 or not(pref ?& array['series','rarity','mode','sort']) or exists(select 1 from jsonb_each(pref) x where jsonb_typeof(x.value)<>'string') then raise exception 'INVALID_INPUT';end if;
   if char_length(pref->>'series')>120 or pref->>'rarity' not in('','Commun','Peu commune','Rare','Épique','Légendaire','Mythique') or pref->>'mode' not in('all','duplicates','missing') or pref->>'sort' not in('name','copies','rarity') then raise exception 'INVALID_INPUT';end if;
   if pref->>'series'<>'' and not exists(select 1 from public.kizuna_cards c where c.card->>'series'=pref->>'series') and not exists(select 1 from public.kizuna_albums a where a.name=pref->>'series') then raise exception 'INVALID_INPUT';end if;
  end if;
  if payload ? 'aura' then
   if jsonb_typeof(payload->'aura') is distinct from 'string' or payload->>'aura' not in('','echo','astral','transcendance') then raise exception 'INVALID_INPUT';end if;
   aura_value:=payload->>'aura';
   if aura_value<>'' and not exists(select 1 from kizuna_private.kizuna_nexus_cosmetic_unlocks c where c.user_id=u and c.cosmetic_id=aura_value) then raise exception 'NEXUS_AURA_LOCKED';end if;
  end if;
  if pref is distinct from p.archive_preferences or aura_value is distinct from p.aura then
   update kizuna_private.kizuna_nexus_progress set archive_preferences=pref,aura=aura_value,revision=revision+1,updated_at=now() where user_id=u;
  end if;
 elsif action='nexus_reward' then
  if (select count(*) from jsonb_object_keys(payload))<>2 or not(payload ?& array['key','periodKey']) or jsonb_typeof(payload->'key') is distinct from 'string' or jsonb_typeof(payload->'periodKey') is distinct from 'string' then raise exception 'INVALID_INPUT';end if;
  key_value:=payload->>'key';period_value:=payload->>'periodKey';
  select x into reward from jsonb_array_elements(kizuna_private.nexus_rewards(u,s)) x where x->>'key'=key_value;
  if reward is null then raise exception 'NEXUS_REWARD_UNAVAILABLE';end if;
  if (reward->>'locked')::boolean then raise exception 'NEXUS_REWARD_LOCKED';end if;
  if period_value is distinct from reward->>'periodKey' then raise exception 'NEXUS_PERIOD_CHANGED';end if;
  if (reward->>'claimed')::boolean then raise exception 'NEXUS_REWARD_CLAIMED';end if;
  if reward->>'kind'='album' and (reward->>'owned')::integer<(reward->>'total')::integer then raise exception 'NEXUS_ALBUM_INCOMPLETE';end if;
  if not(reward->>'available')::boolean then raise exception 'NEXUS_REWARD_UNAVAILABLE';end if;
  insert into kizuna_private.kizuna_nexus_reward_claims(user_id,reward_key,period_key,result) values(u,key_value,period_value,reward) on conflict do nothing;
  get diagnostics inserted=row_count;if inserted<>1 then raise exception 'NEXUS_REWARD_CLAIMED';end if;
  s:=jsonb_set(s,'{chakra}',to_jsonb((s->>'chakra')::bigint+(reward->>'chakra')::integer));
  s:=jsonb_set(s,'{stock,inv}',to_jsonb(coalesce((s#>>'{stock,inv}')::bigint,0)+(reward->>'packs')::integer));
  s:=jsonb_set(s,'{stock,nexusWeekly}',to_jsonb(coalesce((s#>>'{stock,nexusWeekly}')::bigint,0)+(reward->>'weeklyPacks')::integer));
  update kizuna_private.kizuna_nexus_progress set revision=revision+1,updated_at=now() where user_id=u;
  if reward->>'kind'='album' then perform kizuna_private.nexus_award_xp(u,'mission','nexus_album:'||(reward->>'albumId'),20,now());end if;
  result:=jsonb_build_object('key',key_value,'periodKey',period_value,'chakra',(reward->>'chakra')::integer,'rolls',(reward->>'packs')::integer,'weeklyPacks',(reward->>'weeklyPacks')::integer);
 elsif action='nexus_cosmetic' then
  if (select count(*) from jsonb_object_keys(payload))<>3 or not(payload ?& array['id','expectedCost','configVersion']) then raise exception 'INVALID_INPUT';end if;
  if not exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='resonance_2') then raise exception 'NEXUS_COSMETIC_UNAVAILABLE';end if;
  select * into cosmetic from kizuna_private.kizuna_nexus_cosmetics where id=payload->>'id' and enabled;
  if cosmetic.id is null then raise exception 'NEXUS_COSMETIC_UNAVAILABLE';end if;
  select version into cv from kizuna_private.kizuna_nexus_config where id;
  if payload->>'configVersion' is distinct from cv::text or payload->>'expectedCost' is distinct from cosmetic.cost::text then raise exception 'NEXUS_CONFIG_CHANGED';end if;
  if exists(select 1 from kizuna_private.kizuna_nexus_cosmetic_unlocks where user_id=u and cosmetic_id=cosmetic.id) then raise exception 'NEXUS_COSMETIC_OWNED';end if;
  insert into kizuna_private.kizuna_adventure_players(user_id) values(u) on conflict do nothing;
  select state into adventure from kizuna_private.kizuna_adventure_players where user_id=u for update;
  balance:=coalesce((adventure->>'fragments')::integer,0);if balance<cosmetic.cost then raise exception 'INSUFFICIENT_FRAGMENTS';end if;
  insert into kizuna_private.kizuna_nexus_cosmetic_unlocks(user_id,cosmetic_id,cost) values(u,cosmetic.id,cosmetic.cost);
  update kizuna_private.kizuna_adventure_players set state=jsonb_set(adventure,'{fragments}',to_jsonb(balance-cosmetic.cost)),revision=revision+1,updated_at=now() where user_id=u;
  update kizuna_private.kizuna_nexus_progress set revision=revision+1,updated_at=now() where user_id=u;
  result:=jsonb_build_object('cosmeticId',cosmetic.id,'cost',cosmetic.cost,'fragments',balance-cosmetic.cost);
 else raise exception 'UNKNOWN_ACTION';end if;
 return jsonb_build_object('snapshot',s,'result',result);
end; $$;

create or replace function kizuna_private.nexus_snapshot(u uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p kizuna_private.kizuna_nexus_progress;cfg kizuna_private.kizuna_nexus_config;s jsonb;b jsonb;n jsonb;unlocks jsonb;lv bigint;day date:=(now() at time zone 'Europe/Paris')::date;claimed boolean;
 cosmetics jsonb;items jsonb;fragments integer;earned integer;stats jsonb;watch jsonb;tracking jsonb;rows jsonb;rarities jsonb;owned_ids text[];weekly public.kizuna_boosters;weekly_ok boolean:=true;weekly_count bigint;
begin
 perform kizuna_private.nexus_ensure(u);
 select * into strict p from kizuna_private.kizuna_nexus_progress where user_id=u;
 select * into strict cfg from kizuna_private.kizuna_nexus_config where id;
 select snapshot into s from public.kizuna_player_states where user_id=u;s:=coalesce(s,'{"owned":[],"stock":{},"market":{"wishlist":[]}}');
 b:=kizuna_private.nexus_bonuses(u);lv:=1+floor(sqrt(p.xp::numeric/100));owned_ids:=kizuna_private.nexus_owned_ids(u,s);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'branch',branch,'tier',tier,'name',name,'description',description,'cost',cost,'requiredLevel',required_level,'prerequisites',prerequisites,'enabled',enabled,'effect',effect) order by array_position(array['invocation','destin','resonance','collection','prestige'],branch),tier),'[]') into n from kizuna_private.kizuna_nexus_nodes;
 select coalesce(jsonb_agg(node_id order by node_id),'[]') into unlocks from kizuna_private.kizuna_nexus_unlocks where user_id=u;
 select exists(select 1 from kizuna_private.kizuna_nexus_daily_claims where user_id=u and period_key=day) into claimed;
 select coalesce((state->>'fragments')::integer,0) into fragments from kizuna_private.kizuna_adventure_players where user_id=u;
 select coalesce(sum(e.amount),0) into earned from kizuna_private.kizuna_nexus_fragment_events e where e.user_id=u and e.period_key=day;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'cost',c.cost,'owned',exists(select 1 from kizuna_private.kizuna_nexus_cosmetic_unlocks x where x.user_id=u and x.cosmetic_id=c.id)) order by c.cost,c.id),'[]') into items from kizuna_private.kizuna_nexus_cosmetics c where c.enabled;
 cosmetics:=jsonb_build_object('fragments',coalesce(fragments,0),'earnedToday',earned,'dailyCap',cfg.fragments_daily_cap,'items',items,'aura',p.aura);
 begin perform kizuna_private.nexus_weekly_definition();exception when others then if sqlerrm='NEXUS_WEEKLY_UNAVAILABLE' then weekly_ok:=false;else raise;end if;end;
 select * into weekly from public.kizuna_boosters where id=cfg.weekly_booster_id;
 weekly_count:=coalesce((s#>>'{stock,nexusWeekly}')::bigint,0);
 if (b->>'detailedStats')::boolean then
  select jsonb_object_agg(r.name,coalesce(x.n,0)) into rarities from unnest(array['Commun','Peu commune','Rare','Épique','Légendaire','Mythique']) r(name)
   left join(select rarity,count(*) n from kizuna_private.kizuna_draw_journal where user_id=u group by rarity)x on x.rarity=r.name;
  stats:=jsonb_build_object('packs',(select coalesce(sum(packs),0) from kizuna_private.kizuna_booster_journal where user_id=u),'cards',(select count(*) from kizuna_private.kizuna_draw_journal where user_id=u),
   'newCards',(select count(*) from kizuna_private.kizuna_nexus_xp_events where user_id=u and source_kind='discovery'),'rarities',rarities,
   'pity',jsonb_build_object('legendary',jsonb_build_object('current',coalesce((s#>>'{stock,pl}')::integer,0),'threshold',50,'remaining',greatest(0,50-coalesce((s#>>'{stock,pl}')::integer,0))),
    'mythic',jsonb_build_object('current',coalesce((s#>>'{stock,pm}')::integer,0),'threshold',250,'remaining',greatest(0,250-coalesce((s#>>'{stock,pm}')::integer,0)))),
   'odds',jsonb_build_array(jsonb_build_object('id','standard','name','Moteur Kizuna','weights',jsonb_build_object('Commun',600,'Peu commune',230,'Rare',125,'Épique',42,'Légendaire',2,'Mythique',1),
    'guarantee','Trois emplacements libres, un Peu commune minimum, un Rare minimum. Légendaire ou mieux au 50e booster sans Légendaire ; Mythique au 250e sans Mythique. Les poids sont renormalisés selon le minimum de chaque emplacement.',
    'cardCount',(select count(*) from public.kizuna_cards))));
 end if;
 if (b->>'marketWatch')::boolean then
  select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id),'[]') into rows from(
   select m.id,m.created_at,jsonb_build_object('id',m.id,'cardId',m.card_id,'name',c.card->>'name','series',c.card->>'series','rarity',c.card->>'rarity','mode',m.mode,'price',m.price,'topBid',m.top_bid,'seller',pr.username,'createdAt',m.created_at,'endsAt',m.ends_at) item
   from kizuna_private.kizuna_market_listings m join public.kizuna_cards c on c.id=m.card_id join public.kizuna_profiles pr on pr.id=m.seller_id
   where m.status='active' and m.seller_id<>u and (m.ends_at is null or m.ends_at>now()) and m.card_id=any(p.priority_card_ids)
   order by m.created_at desc,m.id limit 40
  )x;watch:=jsonb_build_object('listings',rows,'observedAt',floor(extract(epoch from now())*1000));
 end if;
 if (b->>'advancedTracking')::boolean then
  with copies as(select x.id,count(*) amount from(
    select o->>'id' id from jsonb_array_elements(s->'owned') o
    union all select m.card_id from kizuna_private.kizuna_market_listings m where m.seller_id=u and m.status='active'
   )x group by x.id),targets as(select distinct c.id,c.card->>'rarity' rarity,c.id=any(owned_ids) owned,coalesce(mp.resonance,0) resonance,coalesce(mp.unlocked,0) unlocked,coalesce(f.levels,3) maxlevel,coalesce(cp.amount,0) copies
   from jsonb_array_elements_text(coalesce(s#>'{market,wishlist}','[]')) w(id) join public.kizuna_cards c on c.id=w.id
   left join kizuna_private.kizuna_mythic_progress mp on mp.user_id=u and mp.card_id=c.id left join public.kizuna_mythic_forms f on f.card_id=c.id left join copies cp on cp.id=c.id)
  select jsonb_build_object('scope','wishlist','total',count(*),'owned',count(*) filter(where owned),'missing',count(*) filter(where not owned),'mythics',count(*) filter(where rarity='Mythique'),
   'fullyAwakened',count(*) filter(where rarity='Mythique' and unlocked>=maxlevel),'hasMore',count(*)>100,
   'items',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'owned',owned,'copies',copies,'rarity',rarity,'resonance',resonance,'unlocked',unlocked) order by owned,id),'[]') from(select * from targets order by owned,id limit 100)t))
  into tracking from targets;
 end if;
 return jsonb_build_object('configVersion',cfg.version,'stateRevision',p.revision,'xp',p.xp,'level',lv,'levelFloor',(lv-1)*(lv-1)*100,'nextLevelXp',lv*lv*100,
  'nodes',n,'unlocked',unlocks,'bonuses',b,'daily',jsonb_build_object('available',(b->>'dailyPacks')::integer>0 and not claimed,'claimed',claimed,'periodKey',day,'nextResetAt',kizuna_private.nexus_next_reset(now()),'count',(b->>'dailyPacks')::integer),
  'preferences',jsonb_build_object('priorityCardIds',p.priority_card_ids,'frame',p.frame,'aura',p.aura,'archivePreferences',p.archive_preferences),'recycleRemainder',p.recycle_remainder,
  'rewards',kizuna_private.nexus_rewards(u,s),'cosmetics',cosmetics,'stats',stats,'marketWatch',watch,'advancedTracking',tracking,
  'weeklyBooster',jsonb_build_object('id','nexus:weekly','name',coalesce(weekly.name,'Coffret Nexus'),'count',weekly_count,'available',weekly_ok and weekly_count>0,'definitionId',weekly.id,'cardIds',coalesce(weekly.card_ids,'{}'),'cardCount',coalesce(cardinality(weekly.card_ids),0),'rarities',array['Commun','Peu commune','Rare','Épique','Légendaire','Mythique']),
  'serverNow',floor(extract(epoch from now())*1000),'timezone','Europe/Paris');
end; $$;


-- Every text patch asserts one exact anchor against the deployed function body.
create function kizuna_private.nexus_lot_two_patch_once(source text,anchor text,replacement text) returns text language plpgsql immutable security invoker set search_path='' as $$
begin
 if anchor='' or (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'NEXUS_LOT_TWO_PATCH_ANCHOR: %',left(anchor,100);end if;
 return replace(source,anchor,replacement);
end; $$;
do $patch$
declare d text;anchor text;replacement text;
begin
 d:=pg_get_functiondef('kizuna_private.kizuna_economy(text,jsonb,uuid)'::regprocedure);
 if strpos(d,'nexus_mutate')=0 or strpos(d,'mythic_record_open')=0 or strpos(d,'nexus_refresh_stock')>0 then raise exception 'NEXUS_LOT_TWO_ECONOMY_VERSION';end if;
 d:=kizuna_private.nexus_lot_two_patch_once(d,' l kizuna_private.kizuna_market_listings; target uuid; wants text[]; hours integer; mode text; page integer; rows jsonb; q text;',
  ' l kizuna_private.kizuna_market_listings; target uuid; wants text[]; hours integer; mode text; page integer; rows jsonb; q text; nexus_weekly boolean:=false;');
 anchor:=E' st:=s->''stock'';\n free_n:=coalesce((st->>''free'')::integer,3);inv:=coalesce((st->>''inv'')::integer,2);\n if free_n>=100 then st:=st||jsonb_build_object(''free'',100,''t'',nowms);\n else\n  elapsed:=least(100,greatest(0,floor((nowms-coalesce((st->>''t'')::bigint,nowms))/21600000.0)::integer));\n  free_n:=least(100,free_n+elapsed);\n  st:=st||jsonb_build_object(''free'',free_n,''t'',case when free_n=100 then nowms else coalesce((st->>''t'')::bigint,nowms)+elapsed::bigint*21600000 end);\n end if;';
 replacement:=E' st:=kizuna_private.nexus_refresh_stock(u,s->''stock'',nowms);\n free_n:=(st->>''free'')::integer;inv:=coalesce((st->>''inv'')::integer,2);';
 d:=kizuna_private.nexus_lot_two_patch_once(d,anchor,replacement);
 d:=kizuna_private.nexus_lot_two_patch_once(d,'if p_action in (''nexus_buy'',''nexus_daily'',''nexus_preferences'') then',
  'if p_action in (''nexus_buy'',''nexus_daily'',''nexus_preferences'',''nexus_reward'',''nexus_cosmetic'') then');
 anchor:='  if free_n+inv<n then raise exception ''INSUFFICIENT_PACKS'';end if;';
 replacement:=E'  nexus_weekly:=coalesce(selected=''nexus:weekly'',false);\n  if nexus_weekly then\n   if coalesce((st->>''nexusWeekly'')::bigint,0)<n then raise exception ''INSUFFICIENT_WEEKLY_PACKS'';end if;\n   selected:=''staff:''||kizuna_private.nexus_weekly_definition()::text;\n  elsif free_n+inv<n then raise exception ''INSUFFICIENT_PACKS'';end if;';
 d:=kizuna_private.nexus_lot_two_patch_once(d,anchor,replacement);
 anchor:='  if selected like ''staff:%'' then';
 replacement:=E'  if selected like ''staff:%'' then\n   if not nexus_weekly and substr(selected,7)=(select weekly_booster_id::text from kizuna_private.kizuna_nexus_config where id) then raise exception ''NEXUS_WEEKLY_REQUIRED'';end if;';
 d:=kizuna_private.nexus_lot_two_patch_once(d,anchor,replacement);
 d:=kizuna_private.nexus_lot_two_patch_once(d,'where b.id::text=substr(selected,7) and published;',
  'where b.id::text=substr(selected,7) and (published or (nexus_weekly and b.id=(select weekly_booster_id from kizuna_private.kizuna_nexus_config where id and weekly_enabled)));');
 anchor:='  st:=st||jsonb_build_object(''free'',greatest(0,free_n-n),''inv'',inv-greatest(0,n-free_n),''pm'',pm,''pl'',pl);';
 replacement:=E'  if nexus_weekly then\n   st:=st||jsonb_build_object(''nexusWeekly'',(st->>''nexusWeekly'')::bigint-n,''pm'',pm,''pl'',pl);\n  else\n   st:=st||jsonb_build_object(''free'',greatest(0,free_n-n),''inv'',inv-greatest(0,n-free_n),''pm'',pm,''pl'',pl);\n  end if;';
 d:=kizuna_private.nexus_lot_two_patch_once(d,anchor,replacement);
 d:=kizuna_private.nexus_lot_two_patch_once(d,'result:=jsonb_build_object(''cards'',picked,''packs'',n);','result:=jsonb_build_object(''cards'',picked,''packs'',n,''booster'',p_payload->>''booster'');');
 execute d;
 d:=pg_get_functiondef('kizuna_private.econ_write(uuid,jsonb,text)'::regprocedure);
 anchor:=' if jsonb_array_length(s->''owned'')>5000 then raise exception ''INVENTORY_FULL'';end if;';
 replacement:=E' if coalesce((s#>>''{stock,nexusWeekly}'')::numeric,0) not between 0 and 1000000 or mod(coalesce((s#>>''{stock,nexusWeekly}'')::numeric,0),1)<>0 then raise exception ''BALANCE_LIMIT'';end if;\n s:=jsonb_set(s,''{stock}'',coalesce(s->''stock'',''{}'')||jsonb_build_object(''freeCapacity'',(kizuna_private.nexus_bonuses(u)->>''freeCapacity'')::integer,''nexusWeekly'',coalesce((s#>>''{stock,nexusWeekly}'')::bigint,0)));\n'||anchor;
 d:=kizuna_private.nexus_lot_two_patch_once(d,anchor,replacement);
 execute d;
end;
$patch$;

-- No browser access to new helper functions or the copied lot-one implementation.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='kizuna_private' and p.proname like 'nexus\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
notify pgrst,'reload schema';
