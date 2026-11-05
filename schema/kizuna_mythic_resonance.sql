-- Additive release snapshot; no inventory, balance, receipt or legacy progression is rewritten.
create table kizuna_private.kizuna_mythic_release_backup(id boolean primary key default true check(id),captured_at timestamptz not null default now(),states jsonb not null,adventure jsonb not null,studio jsonb not null);
alter table kizuna_private.kizuna_mythic_release_backup enable row level security;
revoke all on kizuna_private.kizuna_mythic_release_backup from public,anon,authenticated;
insert into kizuna_private.kizuna_mythic_release_backup(states,adventure,studio) select
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.kizuna_player_states s),
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from kizuna_private.kizuna_adventure_players s),
 (select to_jsonb(s) from kizuna_private.kizuna_studio s where id);

create table public.kizuna_mythic_forms(card_id text primary key references public.kizuna_cards(id),levels integer not null check(levels between 2 and 3),art_version text not null default 'resonance-v1');
create table public.kizuna_mythic_rules(id boolean primary key default true check(id),thresholds integer[] not null default array[1,3,6] check(array_length(thresholds,1)=3 and thresholds[1]>=1 and thresholds[2]>thresholds[1] and thresholds[3]>thresholds[2] and thresholds[3]<=100000),revision bigint not null default 1,activated_at timestamptz not null default now());
insert into public.kizuna_mythic_forms(card_id,levels) select id,3 from public.kizuna_cards where card->>'rarity'='Mythique';
insert into public.kizuna_mythic_rules default values;
alter table public.kizuna_mythic_forms enable row level security;
alter table public.kizuna_mythic_rules enable row level security;
revoke all on public.kizuna_mythic_forms,public.kizuna_mythic_rules from public,anon,authenticated;
grant select on public.kizuna_mythic_forms,public.kizuna_mythic_rules to anon,authenticated;
create policy mythic_forms_read on public.kizuna_mythic_forms for select to anon,authenticated using(true);
create policy mythic_rules_read on public.kizuna_mythic_rules for select to anon,authenticated using(true);

create table kizuna_private.kizuna_mythic_progress(user_id uuid not null references public.kizuna_profiles(id),card_id text not null references public.kizuna_cards(id),resonance bigint not null default 0 check(resonance>=0),unlocked integer not null default 0 check(unlocked between 0 and 3),selected integer not null default 0 check(selected between 0 and unlocked),legacy boolean not null default false,updated_at timestamptz not null default now(),primary key(user_id,card_id));
create table kizuna_private.kizuna_mythic_unlocks(user_id uuid not null references public.kizuna_profiles(id),card_id text not null references public.kizuna_cards(id),level integer not null check(level between 1 and 3),unlocked_at timestamptz,primary key(user_id,card_id,level));
create table kizuna_private.kizuna_booster_journal(user_id uuid not null references public.kizuna_profiles(id),request_id uuid not null,packs integer not null check(packs in(1,5,10)),occurred_at timestamptz not null default now(),primary key(user_id,request_id));
create table kizuna_private.kizuna_draw_journal(user_id uuid not null references public.kizuna_profiles(id),request_id uuid not null,ordinal integer not null check(ordinal between 1 and 50),card_id text not null references public.kizuna_cards(id),universe text not null,rarity text not null,duplicate boolean not null,resonance integer not null check(resonance between 0 and 1),occurred_at timestamptz not null default now(),primary key(user_id,request_id,ordinal));
create index mythic_progress_card on kizuna_private.kizuna_mythic_progress(card_id);
create index mythic_unlocks_time on kizuna_private.kizuna_mythic_unlocks(user_id,unlocked_at);
create index mythic_unlocks_card on kizuna_private.kizuna_mythic_unlocks(card_id);
create index booster_journal_time on kizuna_private.kizuna_booster_journal(user_id,occurred_at);
create index draw_journal_time on kizuna_private.kizuna_draw_journal(user_id,occurred_at);
create index draw_journal_card on kizuna_private.kizuna_draw_journal(card_id);
alter table kizuna_private.kizuna_mythic_progress enable row level security;
alter table kizuna_private.kizuna_mythic_unlocks enable row level security;
alter table kizuna_private.kizuna_booster_journal enable row level security;
alter table kizuna_private.kizuna_draw_journal enable row level security;
revoke all on kizuna_private.kizuna_mythic_progress,kizuna_private.kizuna_mythic_unlocks,kizuna_private.kizuna_booster_journal,kizuna_private.kizuna_draw_journal from public,anon,authenticated;
-- Preserve earned Mythic styles if present. Never invent historical booster resonance.
insert into kizuna_private.kizuna_mythic_progress(user_id,card_id,unlocked,selected,legacy)
select p.user_id,e.key,case when (e.value#>>'{}')::integer>=2 then 3 else 1 end,case when (e.value#>>'{}')::integer>=2 then 3 else 1 end,true
from kizuna_private.kizuna_adventure_players p cross join lateral jsonb_each(p.state->'awakened') e join public.kizuna_mythic_forms f on f.card_id=e.key where (e.value#>>'{}')::integer>0;
insert into kizuna_private.kizuna_mythic_unlocks(user_id,card_id,level) select p.user_id,p.card_id,l from kizuna_private.kizuna_mythic_progress p cross join lateral generate_series(1,p.unlocked) l;

create function kizuna_private.mythic_reconcile(u uuid) returns void language plpgsql security invoker set search_path='' as $$
declare p record;thresholds integer[];target integer;lvl integer;
begin
 select r.thresholds into thresholds from public.kizuna_mythic_rules r where id;
 for p in select m.*,f.levels from kizuna_private.kizuna_mythic_progress m join public.kizuna_mythic_forms f using(card_id) join public.kizuna_cards c on c.id=m.card_id where m.user_id=u and c.card->>'rarity'='Mythique' for update of m loop
  select count(*) into target from unnest(thresholds) with ordinality t(n,i) where n<=p.resonance and i<=p.levels;
  if target>p.unlocked then
   update kizuna_private.kizuna_mythic_progress set unlocked=target,updated_at=now() where user_id=u and card_id=p.card_id;
   for lvl in p.unlocked+1..target loop insert into kizuna_private.kizuna_mythic_unlocks(user_id,card_id,level,unlocked_at) values(u,p.card_id,lvl,now()) on conflict do nothing;end loop;
  end if;
 end loop;
end; $$;

create function kizuna_private.mythic_record_open(u uuid,request uuid,before_snapshot jsonb,picked jsonb,packs integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare x record;c jsonb;seen text[];dup boolean;delta integer;p kizuna_private.kizuna_mythic_progress;previous integer;target integer;thresholds integer[];maxlevel integer;lvl integer;awards jsonb:='[]';
begin
 if jsonb_typeof(picked)<>'array' or jsonb_array_length(picked)<>packs*5 then raise exception 'INVALID_SERVER_DRAW';end if;
 insert into kizuna_private.kizuna_booster_journal(user_id,request_id,packs) values(u,request,packs);
 select coalesce(array_agg(distinct id),'{}') into seen from (
 select o->>'id' id from jsonb_array_elements(before_snapshot->'owned') o
 union all select l.card_id from kizuna_private.kizuna_market_listings l where l.seller_id=u and l.status='active') s;
 select r.thresholds into thresholds from public.kizuna_mythic_rules r where id;
 for x in select value copy,ordinality pos from jsonb_array_elements(picked) with ordinality loop
  select card into strict c from public.kizuna_cards where id=x.copy->>'id';dup:=(x.copy->>'id')=any(seen);seen:=array_append(seen,x.copy->>'id');delta:=0;previous:=0;target:=0;
  if c->>'rarity'='Mythique' then
   insert into kizuna_private.kizuna_mythic_progress(user_id,card_id) values(u,x.copy->>'id') on conflict do nothing;
   select * into strict p from kizuna_private.kizuna_mythic_progress where user_id=u and card_id=x.copy->>'id' for update;
   previous:=p.unlocked;delta:=case when dup then 1 else 0 end;
   select f.levels into maxlevel from public.kizuna_mythic_forms f where f.card_id=x.copy->>'id';
   select count(*) into target from unnest(thresholds) with ordinality t(n,i) where n<=p.resonance+delta and i<=coalesce(maxlevel,0);
   target:=greatest(previous,target);
   update kizuna_private.kizuna_mythic_progress set resonance=resonance+delta,unlocked=target,updated_at=now() where user_id=u and card_id=x.copy->>'id';
   if target>previous then for lvl in previous+1..target loop insert into kizuna_private.kizuna_mythic_unlocks(user_id,card_id,level,unlocked_at) values(u,x.copy->>'id',lvl,now()) on conflict do nothing;end loop;end if;
   awards:=awards||jsonb_build_array(jsonb_build_object('index',x.pos-1,'id',x.copy->>'id','delta',delta,'resonance',p.resonance+delta,'from',previous,'unlocked',target));
  end if;
  insert into kizuna_private.kizuna_draw_journal(user_id,request_id,ordinal,card_id,universe,rarity,duplicate,resonance) values(u,request,x.pos,x.copy->>'id',c->>'series',c->>'rarity',dup,delta);
 end loop;
 return awards;
end; $$;

create function kizuna_private.kizuna_mythic(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();cid text;level integer;p kizuna_private.kizuna_mythic_progress;result jsonb;thresholds integer[];r public.kizuna_mythic_rules;
begin
 if u is null or not exists(select 1 from public.kizuna_profiles where id=u) then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16000 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(17493,700);
 if p_action='settings' then
  if not exists(select 1 from public.kizuna_admins where user_id=u) then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
  select * into r from public.kizuna_mythic_rules where id for update;
  if (p_payload->>'revision')::bigint is distinct from r.revision then raise exception 'REVISION_CONFLICT';end if;
  if jsonb_typeof(p_payload->'thresholds')<>'array' or jsonb_array_length(p_payload->'thresholds')<>3 then raise exception 'INVALID_THRESHOLDS';end if;
  select array_agg(v::integer order by i) into thresholds from jsonb_array_elements_text(p_payload->'thresholds') with ordinality t(v,i);
  if thresholds[1]<1 or thresholds[2]<=thresholds[1] or thresholds[3]<=thresholds[2] or thresholds[3]>100000 then raise exception 'INVALID_THRESHOLDS';end if;
  update public.kizuna_mythic_rules set thresholds=thresholds,revision=revision+1 where id;
  insert into private.kizuna_staff_audit(actor_id,action,details) values(u,'mythic_thresholds',p_payload);
 elsif p_action not in ('get','select') then raise exception 'INVALID_ACTION';end if;
 perform kizuna_private.mythic_reconcile(u);
 if p_action='select' then
  cid:=p_payload->>'id';level:=(p_payload->>'level')::integer;
  if not exists(select 1 from public.kizuna_cards c join public.kizuna_mythic_forms f on f.card_id=c.id where c.id=cid and c.card->>'rarity'='Mythique') then raise exception 'MYTHIC_ONLY';end if;
  if level is null or level not between 0 and 3 then raise exception 'INVALID_LEVEL';end if;
  select * into p from kizuna_private.kizuna_mythic_progress where user_id=u and card_id=cid for update;
  if level>coalesce(p.unlocked,0) then raise exception 'AWAKENING_LOCKED';end if;
  if level>0 and (select config#>>'{features,awakening}' from public.kizuna_live_design where id)='false' then raise exception 'FEATURE_DISABLED';end if;
  insert into kizuna_private.kizuna_mythic_progress(user_id,card_id,selected) values(u,cid,0) on conflict(user_id,card_id) do update set selected=level,updated_at=now();
 end if;
 select coalesce(jsonb_object_agg(card_id,jsonb_build_object('resonance',resonance,'unlocked',unlocked,'selected',selected,'legacy',legacy)),'{}') into result from kizuna_private.kizuna_mythic_progress where user_id=u;
 return jsonb_build_object('progress',result,'rules',(select jsonb_build_object('thresholds',m.thresholds,'revision',m.revision,'activated_at',m.activated_at) from public.kizuna_mythic_rules m where id),'server_now',floor(extract(epoch from now())*1000));
end; $$;
create function public.kizuna_mythic(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select kizuna_private.kizuna_mythic(p_action,p_payload);$$;
revoke all on function kizuna_private.mythic_record_open(uuid,uuid,jsonb,jsonb,integer),kizuna_private.mythic_reconcile(uuid),kizuna_private.kizuna_mythic(text,jsonb),public.kizuna_mythic(text,jsonb) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_mythic(text,jsonb),public.kizuna_mythic(text,jsonb) to authenticated;

-- Insert one bounded journal operation after the unchanged economic draw is written.
do $$
declare definition text;needle text:=' if p_action not in (''get'',''browse'',''history'') then insert into kizuna_private.kizuna_economy_receipts';
begin
 definition:=pg_get_functiondef('kizuna_private.kizuna_economy(text,jsonb,uuid)'::regprocedure);
 if strpos(definition,needle)=0 or strpos(definition,'mythic_record_open')>0 then raise exception 'ECONOMY_HOOK_NOT_APPLICABLE';end if;
 definition:=replace(definition,needle,E' if p_action=''open'' then result:=result||jsonb_build_object(''resonance'',kizuna_private.mythic_record_open(u,p_request_id,before_s,result->''cards'',(result->>''packs'')::integer));end if;\n'||needle);
 execute definition;
 -- The retired copies/fragments route may not bypass Mythic resonance.
 definition:=pg_get_functiondef('kizuna_private.kizuna_adventure(text,jsonb)'::regprocedure);
 needle:=' -- Same lock order as economic operations; never consume an escrowed copy.';
 if strpos(definition,needle)=0 then raise exception 'ADVENTURE_HOOK_NOT_APPLICABLE';end if;
 definition:=replace(definition,needle,E' if p_action=''awaken'' then raise exception ''MYTHIC_RESONANCE_REQUIRED'';end if;\n'||needle);
 execute definition;
end; $$;
