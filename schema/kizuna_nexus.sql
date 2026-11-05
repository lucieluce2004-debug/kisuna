-- Nexus des Destinees, lot 1. Apply this complete file in one transaction.
-- Additive only: preserve Auth, balances, inventory, draws, pity and Mythic rules.
-- Existing SECURITY DEFINER entrypoints are patched from their deployed definitions.
select pg_advisory_xact_lock(17493,700);

create table kizuna_private.kizuna_nexus_release_backup(
 id boolean primary key default true check(id), captured_at timestamptz not null default now(),
 functions jsonb not null, states jsonb not null, adventure jsonb not null,
 mythic_progress jsonb not null, anomaly_claims jsonb not null
);
alter table kizuna_private.kizuna_nexus_release_backup enable row level security;
revoke all on kizuna_private.kizuna_nexus_release_backup from public,anon,authenticated;
insert into kizuna_private.kizuna_nexus_release_backup(functions,states,adventure,mythic_progress,anomaly_claims)
select jsonb_build_object(
 'kizuna_private.kizuna_economy(text,jsonb,uuid)',pg_get_functiondef('kizuna_private.kizuna_economy(text,jsonb,uuid)'::regprocedure),
 'kizuna_private.kizuna_adventure(text,jsonb)',pg_get_functiondef('kizuna_private.kizuna_adventure(text,jsonb)'::regprocedure)),
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.kizuna_player_states s),
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from kizuna_private.kizuna_adventure_players s),
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from kizuna_private.kizuna_mythic_progress s),
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from kizuna_private.kizuna_anomaly_claims s);

create table kizuna_private.kizuna_nexus_config(
 id boolean primary key default true check(id),version integer not null default 1 check(version>0),
 recycle_cap_bps integer not null default 1500 check(recycle_cap_bps between 0 and 1500),
 activated_at timestamptz not null default now()
);
insert into kizuna_private.kizuna_nexus_config default values;
create table kizuna_private.kizuna_nexus_nodes(
 id text primary key,branch text not null check(branch in('invocation','destin','resonance','collection','prestige')),
 tier integer not null check(tier between 1 and 5),name text not null,description text not null,
 cost bigint not null check(cost between 1 and 1000000000),required_level integer not null check(required_level between 1 and 10000),
 prerequisites text[] not null default '{}',enabled boolean not null default false,effect jsonb not null,
 unique(branch,tier),check(jsonb_typeof(effect)='object')
);
insert into kizuna_private.kizuna_nexus_nodes(id,branch,tier,name,description,cost,required_level,prerequisites,enabled,effect)
select v.branch||'_'||v.tier,v.branch,v.tier,v.name,v.description,
 (array[1000,2500,5000,10000,20000])[v.tier],(array[1,3,6,10,15])[v.tier],
 case when v.tier=1 then '{}'::text[] else array[v.branch||'_'||(v.tier-1)] end,v.tier=1,v.effect::jsonb
from(values
 ('invocation',1,'Premier Souffle','Un booster quotidien supplémentaire à récupérer ici, à minuit heure de Paris.','{"type":"dailyPacks","value":1}'),
 ('invocation',2,'Réserve Spirituelle','Prévu : un emplacement de stockage supplémentaire.','{"type":"planned"}'),
 ('invocation',3,'Invocation Renforcée','Prévu : un second booster quotidien supplémentaire.','{"type":"planned"}'),
 ('invocation',4,'Maîtrise des Sceaux','Prévu : deux emplacements de stockage supplémentaires.','{"type":"planned"}'),
 ('invocation',5,'Invocation Suprême','Prévu : quatre boosters quotidiens supplémentaires au total.','{"type":"planned"}'),
 ('destin',1,'Vision du Destin','Cinq suivis prioritaires persistants, en plus de ta liste d’envies et de ses alertes existantes.','{"type":"prioritySlots","value":5}'),
 ('destin',2,'Clairvoyance','Prévu : un espace détaillé de suivi des boosters.','{"type":"planned"}'),
 ('destin',3,'Appel des Âmes','Prévu : dix suivis prioritaires supplémentaires.','{"type":"planned"}'),
 ('destin',4,'Traqueur de Destin','Prévu : des outils avancés pour suivre le marché.','{"type":"planned"}'),
 ('destin',5,'Destin Maîtrisé','Prévu : un outil de ciblage, après vérification de l’équilibre des tirages.','{"type":"planned"}'),
 ('resonance',1,'Écho Mythique','Une galerie dédiée à tes cartes Mythiques éveillées.','{"type":"awakenedGallery","value":true}'),
 ('resonance',2,'Fragment d’Âme','Prévu : des fragments cosmétiques pour les doublons Mythiques.','{"type":"planned"}'),
 ('resonance',3,'Révélation','Prévu : une animation exclusive de Résonance.','{"type":"planned"}'),
 ('resonance',4,'Héritage Mythique','Prévu : un bonus plafonné de fragments cosmétiques.','{"type":"planned"}'),
 ('resonance',5,'Transcendance','Prévu : une présentation prestige des Mythiques entièrement éveillées.','{"type":"planned"}'),
 ('collection',1,'Instinct du Collectionneur','5 % de Chakra en plus sur les doublons recyclés ; les fractions sont conservées.','{"type":"recycleBps","value":500}'),
 ('collection',2,'Archiviste','Prévu : des outils avancés de tri et d’organisation.','{"type":"planned"}'),
 ('collection',3,'Trésor Retrouvé','Prévu : 10 % de Chakra de recyclage supplémentaires au total.','{"type":"planned"}'),
 ('collection',4,'Maître des Albums','Prévu : des récompenses uniques pour des albums définis.','{"type":"planned"}'),
 ('collection',5,'Collectionneur Suprême','Prévu : 15 % de Chakra de recyclage supplémentaires au total.','{"type":"planned"}'),
 ('prestige',1,'Ascension','Un cadre de profil Nexus exclusif, à équiper à ta convenance.','{"type":"profileFrame","value":"nexus"}'),
 ('prestige',2,'Héritier des Étoiles','Prévu : une récompense quotidienne supplémentaire.','{"type":"planned"}'),
 ('prestige',3,'Maître du Nexus','Prévu : un booster spécial hebdomadaire.','{"type":"planned"}'),
 ('prestige',4,'Souverain des Destinées','Prévu : une récompense de collection de haut niveau.','{"type":"planned"}'),
 ('prestige',5,'Légende KIZUNA','Prévu : un titre, une animation et une récompense prestige unique.','{"type":"planned"}')
) as v(branch,tier,name,description,effect);

create table kizuna_private.kizuna_nexus_progress(
 user_id uuid primary key references public.kizuna_profiles(id) on delete cascade,
 xp bigint not null default 0 check(xp between 0 and 9007199254740991),revision bigint not null default 0 check(revision>=0),
 priority_card_ids text[] not null default '{}',frame text not null default '' check(frame in('','nexus')),
 recycle_remainder integer not null default 0 check(recycle_remainder between 0 and 9999),
 updated_at timestamptz not null default now(),check(cardinality(priority_card_ids)<=5)
);
create table kizuna_private.kizuna_nexus_unlocks(
 user_id uuid not null references public.kizuna_profiles(id) on delete cascade,node_id text not null references kizuna_private.kizuna_nexus_nodes(id),
 cost bigint not null check(cost>0),config_version integer not null check(config_version>0),unlocked_at timestamptz not null default now(),
 primary key(user_id,node_id)
);
create table kizuna_private.kizuna_nexus_daily_claims(
 user_id uuid not null references public.kizuna_profiles(id) on delete cascade,period_key date not null,
 claimed_at timestamptz not null default now(),primary key(user_id,period_key)
);
create table kizuna_private.kizuna_nexus_xp_events(
 user_id uuid not null references public.kizuna_profiles(id) on delete cascade,
 source_kind text not null check(source_kind in('booster','discovery','awakening','mission','anomaly')),
 source_key text not null check(char_length(source_key) between 1 and 240),amount integer not null check(amount between 1 and 1000),
 occurred_at timestamptz not null default now(),primary key(user_id,source_kind,source_key)
);
create table kizuna_private.kizuna_nexus_discoveries(
 user_id uuid not null references public.kizuna_profiles(id) on delete cascade,card_id text not null references public.kizuna_cards(id),
 first_at timestamptz not null default now(),legacy boolean not null default false,primary key(user_id,card_id)
);
create index kizuna_nexus_unlocks_node on kizuna_private.kizuna_nexus_unlocks(node_id,user_id);
create index kizuna_nexus_discoveries_card on kizuna_private.kizuna_nexus_discoveries(card_id);
do $$declare t text;begin
 foreach t in array array['kizuna_nexus_config','kizuna_nexus_nodes','kizuna_nexus_progress','kizuna_nexus_unlocks','kizuna_nexus_daily_claims','kizuna_nexus_xp_events','kizuna_nexus_discoveries','kizuna_nexus_release_backup'] loop
  execute format('alter table kizuna_private.%I enable row level security',t);
  execute format('revoke all on kizuna_private.%I from public,anon,authenticated',t);
  execute format('grant all on kizuna_private.%I to service_role',t);
  execute format('create policy nexus_service_access on kizuna_private.%I for all to service_role using(true) with check(true)',t);
 end loop;
end; $$;

create function kizuna_private.nexus_next_reset(p_at timestamptz) returns timestamptz
language sql stable security invoker set search_path='' as $$
 select (((p_at at time zone 'Europe/Paris')::date+1)::timestamp at time zone 'Europe/Paris');
$$;
create function kizuna_private.nexus_ensure(u uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(17493,700);
 insert into kizuna_private.kizuna_nexus_progress(user_id) values(u) on conflict do nothing;
end; $$;
create function kizuna_private.nexus_award_xp(u uuid,kind text,key text,amount integer,at_time timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
 perform kizuna_private.nexus_ensure(u);
 insert into kizuna_private.kizuna_nexus_xp_events(user_id,source_kind,source_key,amount,occurred_at)
 values(u,kind,key,amount,coalesce(at_time,now())) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=1 then
  update kizuna_private.kizuna_nexus_progress set xp=xp+amount,revision=revision+1,updated_at=now() where user_id=u;
 end if;
end; $$;
create function kizuna_private.nexus_discover(u uuid,cid text,at_time timestamptz,is_legacy boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
 perform kizuna_private.nexus_ensure(u);
 insert into kizuna_private.kizuna_nexus_discoveries(user_id,card_id,first_at,legacy)
 values(u,cid,coalesce(at_time,now()),is_legacy) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=1 and not is_legacy then perform kizuna_private.nexus_award_xp(u,'discovery',cid,5,at_time);end if;
end; $$;

create function kizuna_private.nexus_bonuses(u uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'dailyPacks',case when exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='invocation_1') then 1 else 0 end,
  'prioritySlots',case when exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='destin_1') then 5 else 0 end,
  'recycleBps',case when exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='collection_1') then least(500,(select recycle_cap_bps from kizuna_private.kizuna_nexus_config where id)) else 0 end,
  'awakenedGallery',exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='resonance_1'),
  'profileFrame',case when exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id='prestige_1') then 'nexus' else '' end
 );
$$;
create function kizuna_private.nexus_snapshot(u uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p kizuna_private.kizuna_nexus_progress;b jsonb;n jsonb;unlocks jsonb;lv bigint;day date:=(now() at time zone 'Europe/Paris')::date;claimed boolean;cv integer;
begin
 perform kizuna_private.nexus_ensure(u);
 select * into strict p from kizuna_private.kizuna_nexus_progress where user_id=u;
 select version into cv from kizuna_private.kizuna_nexus_config where id;
 lv:=1+floor(sqrt(p.xp::numeric/100));b:=kizuna_private.nexus_bonuses(u);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'branch',branch,'tier',tier,'name',name,'description',description,'cost',cost,'requiredLevel',required_level,'prerequisites',prerequisites,'enabled',enabled,'effect',effect) order by array_position(array['invocation','destin','resonance','collection','prestige'],branch),tier),'[]')
 into n from kizuna_private.kizuna_nexus_nodes;
 select coalesce(jsonb_agg(node_id order by node_id),'[]') into unlocks from kizuna_private.kizuna_nexus_unlocks where user_id=u;
 select exists(select 1 from kizuna_private.kizuna_nexus_daily_claims where user_id=u and period_key=day) into claimed;
 return jsonb_build_object('configVersion',cv,'stateRevision',p.revision,'xp',p.xp,'level',lv,'levelFloor',(lv-1)*(lv-1)*100,'nextLevelXp',lv*lv*100,
 'nodes',n,'unlocked',unlocks,'bonuses',b,'daily',jsonb_build_object('available',(b->>'dailyPacks')::integer>0 and not claimed,'claimed',claimed,'periodKey',day,'nextResetAt',kizuna_private.nexus_next_reset(now()),'count',(b->>'dailyPacks')::integer),
 'preferences',jsonb_build_object('priorityCardIds',p.priority_card_ids,'frame',p.frame),'recycleRemainder',p.recycle_remainder,
 'serverNow',floor(extract(epoch from now())*1000),'timezone','Europe/Paris');
end; $$;

create function kizuna_private.nexus_mutate(u uuid,action text,payload jsonb,s jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p kizuna_private.kizuna_nexus_progress;n kizuna_private.kizuna_nexus_nodes;cv integer;lv bigint;b jsonb;ids text[];frame_value text;day date:=(now() at time zone 'Europe/Paris')::date;added integer;wishlist jsonb;result jsonb:='{}';
begin
 if u is distinct from auth.uid() then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_INPUT';end if;
 perform kizuna_private.nexus_ensure(u);
 select * into strict p from kizuna_private.kizuna_nexus_progress where user_id=u for update;
 b:=kizuna_private.nexus_bonuses(u);
 if action='nexus_buy' then
  if (select count(*) from jsonb_object_keys(payload))<>3 or not(payload ?& array['nodeId','configVersion','expectedCost']) then raise exception 'INVALID_INPUT';end if;
  select version into cv from kizuna_private.kizuna_nexus_config where id;
  select * into n from kizuna_private.kizuna_nexus_nodes where id=payload->>'nodeId';
  if n.id is null or not n.enabled or n.tier<>1 then raise exception 'NEXUS_NODE_UNAVAILABLE';end if;
  if payload->>'configVersion' is distinct from cv::text or payload->>'expectedCost' is distinct from n.cost::text then raise exception 'NEXUS_CONFIG_CHANGED';end if;
  if exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=u and node_id=n.id) then raise exception 'NEXUS_ALREADY_UNLOCKED';end if;
  lv:=1+floor(sqrt(p.xp::numeric/100));
  if lv<n.required_level then raise exception 'NEXUS_LEVEL_REQUIRED';end if;
  if exists(select 1 from unnest(n.prerequisites) r(id) where not exists(select 1 from kizuna_private.kizuna_nexus_unlocks x where x.user_id=u and x.node_id=r.id)) then raise exception 'NEXUS_PREREQUISITE_REQUIRED';end if;
  if (s->>'chakra')::bigint<n.cost then raise exception 'INSUFFICIENT_CHAKRA';end if;
  insert into kizuna_private.kizuna_nexus_unlocks(user_id,node_id,cost,config_version) values(u,n.id,n.cost,cv);
  s:=jsonb_set(s,'{chakra}',to_jsonb((s->>'chakra')::bigint-n.cost));
  update kizuna_private.kizuna_nexus_progress set revision=revision+1,updated_at=now() where user_id=u;
  result:=jsonb_build_object('nodeId',n.id,'cost',n.cost,'configVersion',cv);
 elsif action='nexus_daily' then
  if (select count(*) from jsonb_object_keys(payload))<>1 or not(payload ? 'periodKey') then raise exception 'INVALID_INPUT';end if;
  if (b->>'dailyPacks')::integer<1 then raise exception 'NEXUS_DAILY_LOCKED';end if;
  if payload->>'periodKey' is distinct from day::text then raise exception 'NEXUS_PERIOD_CHANGED';end if;
  insert into kizuna_private.kizuna_nexus_daily_claims(user_id,period_key) values(u,day) on conflict do nothing;
  get diagnostics added=row_count;
  if added=0 then raise exception 'NEXUS_DAILY_CLAIMED';end if;
  s:=jsonb_set(s,'{stock,inv}',to_jsonb(coalesce((s#>>'{stock,inv}')::bigint,0)+(b->>'dailyPacks')::integer));
  update kizuna_private.kizuna_nexus_progress set revision=revision+1,updated_at=now() where user_id=u;
  result:=jsonb_build_object('rolls',(b->>'dailyPacks')::integer,'periodKey',day);
 elsif action='nexus_preferences' then
  if payload='{}'::jsonb or exists(select 1 from jsonb_object_keys(payload) x(k) where k not in('priorityCardIds','frame')) then raise exception 'INVALID_INPUT';end if;
  ids:=p.priority_card_ids;frame_value:=p.frame;
  if payload ? 'priorityCardIds' then
   if jsonb_typeof(payload->'priorityCardIds') is distinct from 'array' or jsonb_array_length(payload->'priorityCardIds')>5 then raise exception 'NEXUS_PRIORITY_LIMIT';end if;
   if exists(select 1 from jsonb_array_elements(payload->'priorityCardIds') x where jsonb_typeof(x)<>'string') then raise exception 'INVALID_INPUT';end if;
   select coalesce(array_agg(value order by ordinality),'{}') into ids from jsonb_array_elements_text(payload->'priorityCardIds') with ordinality;
   if cardinality(ids)>(b->>'prioritySlots')::integer then raise exception 'NEXUS_PRIORITY_LOCKED';end if;
   if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or exists(select 1 from unnest(ids) x where not exists(select 1 from public.kizuna_cards c where c.id=x)) then raise exception 'INVALID_INPUT';end if;
   -- Adding a priority subscribes to the existing alerts; removal never erases the wishlist.
   select coalesce(jsonb_agg(to_jsonb(x.id) order by x.id),'[]') into wishlist from(
    select value id from jsonb_array_elements_text(coalesce(s#>'{market,wishlist}','[]'))
    union select unnest(ids)
   ) x;
   if jsonb_array_length(wishlist)>5000 then raise exception 'NEXUS_PRIORITY_LIMIT';end if;
   s:=jsonb_set(s,'{market}',coalesce(s->'market','{}')||jsonb_build_object('wishlist',wishlist));
  end if;
  if payload ? 'frame' then
   if jsonb_typeof(payload->'frame') is distinct from 'string' or payload->>'frame' not in('','nexus') then raise exception 'INVALID_INPUT';end if;
   frame_value:=payload->>'frame';
   if frame_value='nexus' and b->>'profileFrame'<>'nexus' then raise exception 'NEXUS_FRAME_LOCKED';end if;
  end if;
  if ids is distinct from p.priority_card_ids or frame_value is distinct from p.frame then
   update kizuna_private.kizuna_nexus_progress set priority_card_ids=ids,frame=frame_value,revision=revision+1,updated_at=now() where user_id=u;
  end if;
 else raise exception 'UNKNOWN_ACTION';end if;
 return jsonb_build_object('snapshot',s,'result',result);
end; $$;

create function kizuna_private.nexus_recycle(u uuid,action text,payload jsonb,s jsonb,base_amount bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p kizuna_private.kizuna_nexus_progress;bps integer;eligible bigint:=0;bonus bigint:=0;carry bigint;next_remainder integer;
begin
 perform kizuna_private.nexus_ensure(u);
 select * into strict p from kizuna_private.kizuna_nexus_progress where user_id=u for update;
 bps:=(kizuna_private.nexus_bonuses(u)->>'recycleBps')::integer;
 if action='recycle_all' or (action='recycle' and (select count(*) from jsonb_array_elements(s->'owned') x where x->>'id'=payload->>'cardId')>1) then eligible:=base_amount;end if;
 carry:=eligible*bps+p.recycle_remainder;bonus:=carry/10000;next_remainder:=(carry%10000)::integer;
 if next_remainder<>p.recycle_remainder or bonus>0 then
  update kizuna_private.kizuna_nexus_progress set recycle_remainder=next_remainder,revision=revision+1,updated_at=now() where user_id=u;
 end if;
 return jsonb_build_object('base',base_amount,'eligibleBase',eligible,'bonus',bonus,'total',base_amount+bonus,'recycleBps',bps,'remainder',next_remainder);
end; $$;

-- Backfill only facts backed by existing server journals. Legacy possession grants no XP.
do $$declare r record;begin
 for r in select user_id,request_id,packs,occurred_at from kizuna_private.kizuna_booster_journal order by occurred_at,user_id,request_id loop
  perform kizuna_private.nexus_award_xp(r.user_id,'booster',r.request_id::text,10*r.packs,r.occurred_at);
 end loop;
 for r in select distinct on(user_id,card_id) user_id,card_id,duplicate,occurred_at from kizuna_private.kizuna_draw_journal order by user_id,card_id,occurred_at,request_id,ordinal loop
  perform kizuna_private.nexus_discover(r.user_id,r.card_id,r.occurred_at,r.duplicate);
 end loop;
 for r in select s.user_id,o->>'id' card_id from public.kizuna_player_states s cross join lateral jsonb_array_elements(s.snapshot->'owned') o
  union select seller_id,card_id from kizuna_private.kizuna_market_listings where status='active' loop
  if exists(select 1 from public.kizuna_cards where id=r.card_id) then perform kizuna_private.nexus_discover(r.user_id,r.card_id,now(),true);end if;
 end loop;
 for r in select user_id,card_id,level,unlocked_at from kizuna_private.kizuna_mythic_unlocks where unlocked_at is not null loop
  perform kizuna_private.nexus_award_xp(r.user_id,'awakening',r.card_id||':'||r.level,25,r.unlocked_at);
 end loop;
 for r in select a.user_id,c.key,c.value from kizuna_private.kizuna_adventure_players a cross join lateral jsonb_each(a.state->'claims') c
  join public.kizuna_adventure_definitions d on d.id=c.value->>'id'
  where c.value->>'kind' in('mission','constellation','event') and d.requirements->>'metric' in('cards','total','universe','discoveries','awakenings','constellations') loop
  perform kizuna_private.nexus_award_xp(r.user_id,'mission',r.key,20,case when r.value->>'at' ~ '^[0-9]{1,15}$' then to_timestamp((r.value->>'at')::numeric/1000) else now() end);
 end loop;
 for r in select user_id,event_id,challenge_id,claimed_at from kizuna_private.kizuna_anomaly_claims loop
  perform kizuna_private.nexus_award_xp(r.user_id,'anomaly',r.event_id::text||':'||r.challenge_id,30,r.claimed_at);
 end loop;
end; $$;

create function kizuna_private.nexus_journal_xp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='kizuna_booster_journal' then perform kizuna_private.nexus_award_xp(new.user_id,'booster',new.request_id::text,new.packs*10,new.occurred_at);
 elsif tg_table_name='kizuna_draw_journal' then perform kizuna_private.nexus_discover(new.user_id,new.card_id,new.occurred_at,new.duplicate);
 elsif tg_table_name='kizuna_mythic_unlocks' then
  if new.unlocked_at is not null then perform kizuna_private.nexus_award_xp(new.user_id,'awakening',new.card_id||':'||new.level,25,new.unlocked_at);end if;
 elsif tg_table_name='kizuna_anomaly_claims' then perform kizuna_private.nexus_award_xp(new.user_id,'anomaly',new.event_id::text||':'||new.challenge_id,30,new.claimed_at);
 end if;
 return new;
end; $$;
create function kizuna_private.nexus_adventure_xp() returns trigger
language plpgsql security invoker set search_path='' as $$
declare c record;previous jsonb:='{}';
begin
 if tg_op='UPDATE' then previous:=coalesce(old.state->'claims','{}');end if;
 for c in select j.key,j.value from jsonb_each(coalesce(new.state->'claims','{}')) j
  join public.kizuna_adventure_definitions d on d.id=j.value->>'id'
  where not(previous ? j.key) and j.value->>'kind' in('mission','constellation','event') and d.requirements->>'metric' in('cards','total','universe','discoveries','awakenings','constellations') loop
  perform kizuna_private.nexus_award_xp(new.user_id,'mission',c.key,20,now());
 end loop;
 return new;
end; $$;
create trigger kizuna_nexus_booster_xp after insert on kizuna_private.kizuna_booster_journal for each row execute function kizuna_private.nexus_journal_xp();
create trigger kizuna_nexus_draw_xp after insert on kizuna_private.kizuna_draw_journal for each row execute function kizuna_private.nexus_journal_xp();
create trigger kizuna_nexus_awakening_xp after insert on kizuna_private.kizuna_mythic_unlocks for each row execute function kizuna_private.nexus_journal_xp();
create trigger kizuna_nexus_anomaly_xp after insert on kizuna_private.kizuna_anomaly_claims for each row execute function kizuna_private.nexus_journal_xp();
create trigger kizuna_nexus_adventure_xp after insert or update of state on kizuna_private.kizuna_adventure_players for each row execute function kizuna_private.nexus_adventure_xp();

create function kizuna_private.kizuna_nexus(p_action text default 'get',p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.kizuna_profiles where id=u) then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if p_action is distinct from 'get' or p_payload is null or p_payload<>'{}'::jsonb then raise exception 'INVALID_INPUT';end if;
 return kizuna_private.nexus_snapshot(u);
end; $$;
create function public.kizuna_nexus(p_action text default 'get',p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
 select kizuna_private.kizuna_nexus(p_action,p_payload);
$$;

-- Patch exact deployed bodies. Unexpected anchors abort the entire migration.
do $patch$
declare d text;anchor text;replacement text;
begin
 d:=pg_get_functiondef('kizuna_private.kizuna_adventure(text,jsonb)'::regprocedure);
 anchor:=' insert into kizuna_private.kizuna_adventure_players(user_id) values(actor) on conflict do nothing;';
 if (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 then raise exception 'NEXUS_ADVENTURE_ANCHOR';end if;
 if strpos(d,'pg_advisory_xact_lock(17493,700)')=0 then
  execute replace(d,anchor,E' -- NEXUS_LOCK_ORDER: before adventure row locks, matching Mythic compatibility.\n perform pg_advisory_xact_lock(17493,700);\n'||anchor);
 elsif strpos(d,'pg_advisory_xact_lock(17493,700)')>strpos(d,anchor) then raise exception 'NEXUS_ADVENTURE_LOCK_ORDER';
 end if;

 d:=pg_get_functiondef('kizuna_private.kizuna_economy(text,jsonb,uuid)'::regprocedure);
 if strpos(d,'mythic_record_open')=0 or strpos(d,'nexus_mutate')>0 or strpos(d,'pg_advisory_xact_lock(17493,700)')=0 then raise exception 'NEXUS_ECONOMY_VERSION';end if;
 anchor:=' if p_action=''get'' then null;';
 if (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 then raise exception 'NEXUS_DISPATCH_ANCHOR';end if;
 replacement:=E' if p_action in (''nexus_buy'',''nexus_daily'',''nexus_preferences'') then\n  reward:=kizuna_private.nexus_mutate(u,p_action,p_payload,s);s:=reward->''snapshot'';result:=reward->''result'';\n elsif p_action=''get'' then null;';
 d:=replace(d,anchor,replacement);
 anchor:='  s:=jsonb_set(jsonb_set(s,''{owned}'',newowned),''{chakra}'',to_jsonb((s->>''chakra'')::bigint+amount));result:=jsonb_build_object(''chakra'',amount);';
 if (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 then raise exception 'NEXUS_RECYCLE_ANCHOR';end if;
 replacement:=E'  reward:=kizuna_private.nexus_recycle(u,p_action,p_payload,s,amount);amount:=(reward->>''total'')::bigint;\n  s:=jsonb_set(jsonb_set(s,''{owned}'',newowned),''{chakra}'',to_jsonb((s->>''chakra'')::bigint+amount));result:=reward||jsonb_build_object(''chakra'',amount);';
 d:=replace(d,anchor,replacement);
 anchor:=' if p_action not in (''get'',''browse'',''history'') then insert into kizuna_private.kizuna_economy_receipts';
 if (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 then raise exception 'NEXUS_RECEIPT_ANCHOR';end if;
 d:=replace(d,anchor,E' result:=result||jsonb_build_object(''nexus'',kizuna_private.nexus_snapshot(u));\n'||anchor);
 anchor:='return kizuna_private.econ_snapshot(u)||jsonb_build_object(''result'',rec.result,''replayed'',true);';
 if (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 then raise exception 'NEXUS_REPLAY_ANCHOR';end if;
 d:=replace(d,anchor,'return kizuna_private.econ_snapshot(u)||jsonb_build_object(''result'',rec.result||jsonb_build_object(''nexus'',kizuna_private.nexus_snapshot(u)),''replayed'',true);');
 execute d;
end;
$patch$;

-- Helpers and facts remain inaccessible to browsers. The only new browser RPC is an own-account read.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='kizuna_private' and (p.proname like 'nexus\_%' escape '\' or p.proname='kizuna_nexus') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
revoke all on function public.kizuna_nexus(text,jsonb) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_nexus(text,jsonb),public.kizuna_nexus(text,jsonb) to authenticated;
notify pgrst,'reload schema';
