create table kizuna_private.kizuna_anomaly_drafts(id uuid primary key default gen_random_uuid(),config jsonb not null,revision bigint not null default 1,published_revision bigint not null default 0,updated_at timestamptz not null default now());
create table public.kizuna_anomalies(id uuid primary key references kizuna_private.kizuna_anomaly_drafts(id),config jsonb not null,enabled boolean not null default true,status text not null default 'published' check(status in('published','archived')),revision bigint not null,published_at timestamptz not null default now());
create table kizuna_private.kizuna_anomaly_participants(event_id uuid not null references kizuna_private.kizuna_anomaly_drafts(id),user_id uuid not null references public.kizuna_profiles(id),first_at timestamptz not null default now(),last_at timestamptz not null default now(),primary key(event_id,user_id));
create table kizuna_private.kizuna_anomaly_claims(user_id uuid not null references public.kizuna_profiles(id),event_id uuid not null references kizuna_private.kizuna_anomaly_drafts(id),challenge_id text not null,reward jsonb not null,claimed_at timestamptz not null default now(),primary key(user_id,event_id,challenge_id));
create table kizuna_private.kizuna_anomaly_cosmetics(user_id uuid primary key references public.kizuna_profiles(id),selection jsonb not null default '{}',revision bigint not null default 0);
create index anomaly_participants_user on kizuna_private.kizuna_anomaly_participants(user_id);
create index anomaly_claims_event on kizuna_private.kizuna_anomaly_claims(event_id);
alter table kizuna_private.kizuna_anomaly_drafts enable row level security;
alter table public.kizuna_anomalies enable row level security;
alter table kizuna_private.kizuna_anomaly_participants enable row level security;
alter table kizuna_private.kizuna_anomaly_claims enable row level security;
alter table kizuna_private.kizuna_anomaly_cosmetics enable row level security;
revoke all on kizuna_private.kizuna_anomaly_drafts,public.kizuna_anomalies,kizuna_private.kizuna_anomaly_participants,kizuna_private.kizuna_anomaly_claims,kizuna_private.kizuna_anomaly_cosmetics from public,anon,authenticated;
grant select on public.kizuna_anomalies to anon,authenticated;
create policy anomaly_public_read on public.kizuna_anomalies for select to anon,authenticated using(enabled and status='published');

create function kizuna_private.anomaly_validate(v jsonb,publishing boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare x jsonb;rows jsonb:='[]';seen text[]:='{}';ids jsonb;start_at timestamptz;end_at timestamptz;r jsonb;
begin
 if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>50000 then raise exception 'INVALID_EVENT';end if;
 if char_length(btrim(coalesce(v->>'title',''))) not between 3 and 90 or char_length(coalesce(v->>'description',''))>1200 or coalesce(v->>'theme','') not in('eclipse','nocturne','convergence') then raise exception 'INVALID_EVENT';end if;
 if coalesce(v->>'image','')<>'' and (v->>'image' !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}/[^[:space:]<>"\\]+\.(png|jpe?g|webp|avif)(\?[^[:space:]<>"\\]*)?$' or coalesce(v->>'image_source','') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}/[^[:space:]<>"\\]*$') then raise exception 'INVALID_IMAGE_URL';end if;
 start_at:=nullif(v->>'starts_at','')::timestamptz;end_at:=nullif(v->>'ends_at','')::timestamptz;
 if (start_at is null)<>(end_at is null) or end_at<=start_at or end_at-start_at>interval '366 days' or publishing and (start_at is null or end_at<=now()) then raise exception 'INVALID_DATES';end if;
 if jsonb_typeof(v->'challenges') is distinct from 'array' or jsonb_array_length(v->'challenges') not between 1 and 12 then raise exception 'INVALID_CHALLENGES';end if;
 for x in select value from jsonb_array_elements(v->'challenges') loop
  if coalesce(x->>'id','') !~ '^[a-z0-9][a-z0-9-]{1,39}$' or (x->>'id')=any(seen) then raise exception 'INVALID_CHALLENGE_ID';end if;seen:=array_append(seen,x->>'id');
  if char_length(btrim(coalesce(x->>'label',''))) not between 3 and 100 or char_length(coalesce(x->>'description',''))>400 or coalesce(x->>'difficulty','') not in('discovery','collector','prestige') or coalesce(x->>'metric','') not in('boosters','cards','characters','duplicates','universe','universes','mythics','awakenings','resonance','resonant_cards') or coalesce(x->>'goal','') !~ '^[1-9][0-9]{0,5}$' then raise exception 'INVALID_CHALLENGE';end if;
  if x->>'metric'='universe' and not exists(select 1 from public.kizuna_cards c where c.card->>'series'=x->>'universe') then raise exception 'INVALID_UNIVERSE';end if;
  if jsonb_typeof(coalesce(x->'card_ids','[]'))<>'array' or jsonb_array_length(coalesce(x->'card_ids','[]'))>100 then raise exception 'INVALID_CARDS';end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(x->'card_ids','[]')) id where not exists(select 1 from public.kizuna_cards c where c.id=id)) then raise exception 'INVALID_CARD';end if;
  select coalesce(jsonb_agg(id),'[]') into ids from(select distinct jsonb_array_elements_text(coalesce(x->'card_ids','[]')) id) z;
  if coalesce(x->>'min_level','1') not in('1','2','3') then raise exception 'INVALID_LEVEL';end if;
  r:=x->'reward';if jsonb_typeof(r) is distinct from 'object' or coalesce(r->>'kind','') not in('badge','title','frame','decoration','background','effect') or char_length(btrim(coalesce(r->>'label',''))) not between 2 and 90 or coalesce(r->>'style','') not in('eclipse','nocturne','convergence') then raise exception 'INVALID_REWARD';end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',x->>'id','label',btrim(x->>'label'),'description',coalesce(x->>'description',''),'difficulty',x->>'difficulty','metric',x->>'metric','goal',(x->>'goal')::integer,'universe',coalesce(x->>'universe',''),'card_ids',ids,'min_level',coalesce((x->>'min_level')::integer,1),'reward',jsonb_build_object('kind',r->>'kind','label',btrim(r->>'label'),'style',r->>'style')));
 end loop;
 return jsonb_build_object('title',btrim(v->>'title'),'description',coalesce(v->>'description',''),'theme',v->>'theme','image',coalesce(v->>'image',''),'image_source',coalesce(v->>'image_source',''),'starts_at',start_at,'ends_at',end_at,'challenges',rows);
end; $$;

create function kizuna_private.anomaly_measure(u uuid,c jsonb,start_at timestamptz,end_at timestamptz) returns bigint language plpgsql stable security invoker set search_path='' as $$
declare n bigint;metric text:=c->>'metric';
begin
 if metric='boosters' then select coalesce(sum(packs),0) into n from kizuna_private.kizuna_booster_journal where user_id=u and occurred_at>=start_at and occurred_at<end_at;
 elsif metric='awakenings' then select count(distinct card_id) into n from kizuna_private.kizuna_mythic_unlocks where user_id=u and unlocked_at>=start_at and unlocked_at<end_at and level>=coalesce((c->>'min_level')::integer,1) and (jsonb_array_length(c->'card_ids')=0 or c->'card_ids' ? card_id);
 else
  select case metric when 'characters' then count(distinct card_id) when 'universes' then count(distinct universe) when 'resonant_cards' then count(distinct card_id) filter(where resonance>0) when 'resonance' then coalesce(sum(resonance),0) else count(*) end into n
  from kizuna_private.kizuna_draw_journal where user_id=u and occurred_at>=start_at and occurred_at<end_at
   and (jsonb_array_length(c->'card_ids')=0 or c->'card_ids' ? card_id)
   and (metric<>'duplicates' or duplicate) and (metric<>'mythics' or rarity='Mythique') and (metric<>'universe' or universe=c->>'universe');
 end if;
 return n;
end; $$;
create function kizuna_private.anomaly_enrol(u uuid) returns void language sql security invoker set search_path='' as $$
 insert into kizuna_private.kizuna_anomaly_participants(event_id,user_id)
 select id,u from public.kizuna_anomalies where enabled and status='published' and (config->>'starts_at')::timestamptz<=now() and (config->>'ends_at')::timestamptz>now()
 on conflict(event_id,user_id) do update set last_at=now();
$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('kizuna_private.mythic_record_open(uuid,uuid,jsonb,jsonb,integer)'::regprocedure);
 if strpos(definition,' return awards;')=0 then raise exception 'ANOMALY_HOOK_NOT_APPLICABLE';end if;
 execute replace(definition,' return awards;',E' perform kizuna_private.anomaly_enrol(u);\n return awards;');
end; $$;

create function kizuna_private.kizuna_anomalies(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=auth.uid();d kizuna_private.kizuna_anomaly_drafts;e public.kizuna_anomalies;eid uuid;v jsonb;c jsonb;rows jsonb;events jsonb:='[]';challenges jsonb;rewards jsonb;selection jsonb;start_at timestamptz;end_at timestamptz;n bigint;key text;kind text;inserted integer;page integer;enabled boolean;
begin
 if u is null or not exists(select 1 from public.kizuna_profiles where id=u) then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>60000 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(17493,700);
 if p_action in('admin_list','save','publish','toggle','archive','participants') then
  if not exists(select 1 from public.kizuna_admins where user_id=u) then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
  if p_action='save' then
   v:=kizuna_private.anomaly_validate(p_payload->'config');eid:=nullif(p_payload->>'id','')::uuid;
   if eid is null then insert into kizuna_private.kizuna_anomaly_drafts(config) values(v) returning * into d;
   else
    select * into strict d from kizuna_private.kizuna_anomaly_drafts where id=eid for update;
    if (p_payload->>'revision')::bigint is distinct from d.revision then raise exception 'REVISION_CONFLICT';end if;
    update kizuna_private.kizuna_anomaly_drafts set config=v,revision=revision+1,updated_at=now() where id=eid returning * into d;
   end if;
  elsif p_action in('publish','toggle','archive') then
   eid:=(p_payload->>'id')::uuid;select * into strict d from kizuna_private.kizuna_anomaly_drafts where id=eid for update;
   if (p_payload->>'revision')::bigint is distinct from d.revision then raise exception 'REVISION_CONFLICT';end if;
   select * into e from public.kizuna_anomalies where id=eid for update;
   update kizuna_private.kizuna_anomaly_drafts set revision=revision+1,updated_at=now() where id=eid returning * into d;
   if p_action='publish' then
    v:=kizuna_private.anomaly_validate(d.config,true);
    if e.id is not null and (e.config->>'starts_at')::timestamptz<=now() and (v->'challenges'<>e.config->'challenges' or v->'starts_at'<>e.config->'starts_at' or v->'ends_at'<>e.config->'ends_at') then raise exception 'EVENT_STARTED';end if;
    insert into public.kizuna_anomalies(id,config,revision) values(eid,v,d.revision) on conflict(id) do update set config=v,revision=d.revision,status='published',enabled=true;
    update kizuna_private.kizuna_anomaly_drafts set published_revision=revision where id=eid;
   elsif p_action='toggle' then
    if e.id is null or e.status='archived' or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'INVALID_EVENT';end if;
    update public.kizuna_anomalies set enabled=(p_payload->>'enabled')::boolean where id=eid;
   else
    if e.id is null or (e.config->>'ends_at')::timestamptz>now() then raise exception 'EVENT_NOT_ENDED';end if;
    update public.kizuna_anomalies set status='archived',enabled=false where id=eid;
   end if;
  elsif p_action='participants' then
   eid:=(p_payload->>'id')::uuid;page:=coalesce((p_payload->>'page')::integer,0);if page not between 0 and 10000 then raise exception 'INVALID_PAGE';end if;
   select coalesce(jsonb_agg(z),'[]') into rows from(select p.username,a.first_at,a.last_at,(select count(*) from kizuna_private.kizuna_anomaly_claims c where c.event_id=eid and c.user_id=a.user_id) rewards from kizuna_private.kizuna_anomaly_participants a join public.kizuna_profiles p on p.id=a.user_id where a.event_id=eid order by a.first_at,a.user_id offset page*25 limit 26) z;
   return jsonb_build_object('participants',rows,'page',page);
  end if;
  if p_action<>'admin_list' then insert into private.kizuna_staff_audit(actor_id,action,details) values(u,'anomaly_'||p_action,jsonb_build_object('id',coalesce(eid,d.id),'revision',d.revision));end if;
  select coalesce(jsonb_agg(x order by x.updated_at desc),'[]') into rows from(select dr.*,coalesce(to_jsonb(pub),'null') live,(select count(*) from kizuna_private.kizuna_anomaly_participants a where a.event_id=dr.id) participants from kizuna_private.kizuna_anomaly_drafts dr left join public.kizuna_anomalies pub using(id) order by dr.updated_at desc limit 200) x;
  return jsonb_build_object('drafts',rows,'saved_id',coalesce(eid,d.id),'server_now',floor(extract(epoch from now())*1000));
 end if;
 if p_action='claim' then
  eid:=(p_payload->>'event')::uuid;select * into e from public.kizuna_anomalies where id=eid and enabled and status='published';
  if e.id is null or now()<(e.config->>'starts_at')::timestamptz or now()>=(e.config->>'ends_at')::timestamptz then raise exception 'EVENT_INACTIVE';end if;
  select x into c from jsonb_array_elements(e.config->'challenges') x where x->>'id'=p_payload->>'challenge';if c is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
  n:=kizuna_private.anomaly_measure(u,c,greatest(e.published_at,(e.config->>'starts_at')::timestamptz),(e.config->>'ends_at')::timestamptz);
  if n<(c->>'goal')::bigint then raise exception 'REQUIREMENTS_NOT_MET';end if;
  insert into kizuna_private.kizuna_anomaly_claims(user_id,event_id,challenge_id,reward) values(u,eid,c->>'id',c->'reward') on conflict do nothing;
  insert into kizuna_private.kizuna_anomaly_participants(event_id,user_id) values(eid,u) on conflict do nothing;
 elsif p_action='equip' then
  kind:=p_payload->>'kind';key:=coalesce(p_payload->>'key','');if kind not in('badge','title','frame','decoration','background','effect') then raise exception 'INVALID_REWARD';end if;
  if key<>'' and not exists(select 1 from kizuna_private.kizuna_anomaly_claims a where a.user_id=u and a.event_id::text||':'||a.challenge_id=key and a.reward->>'kind'=kind) then raise exception 'REWARD_LOCKED';end if;
  insert into kizuna_private.kizuna_anomaly_cosmetics(user_id) values(u) on conflict do nothing;
  update kizuna_private.kizuna_anomaly_cosmetics a set selection=a.selection||jsonb_build_object(kind,key),revision=revision+1 where user_id=u;
 elsif p_action<>'get' then raise exception 'INVALID_ACTION';end if;
 for e in select * from public.kizuna_anomalies where enabled and status='published' order by (config->>'starts_at')::timestamptz desc limit 100 loop
  challenges:='[]';start_at:=greatest(e.published_at,(e.config->>'starts_at')::timestamptz);end_at:=(e.config->>'ends_at')::timestamptz;
  for c in select value from jsonb_array_elements(e.config->'challenges') loop
   n:=kizuna_private.anomaly_measure(u,c,start_at,end_at);
   challenges:=challenges||jsonb_build_array(c||jsonb_build_object('value',n,'claimed',exists(select 1 from kizuna_private.kizuna_anomaly_claims a where a.user_id=u and a.event_id=e.id and a.challenge_id=c->>'id')));
  end loop;
  events:=events||jsonb_build_array(jsonb_build_object('id',e.id,'config',e.config||jsonb_build_object('challenges',challenges),'revision',e.revision,'published_at',e.published_at));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('key',event_id::text||':'||challenge_id,'event',event_id,'challenge',challenge_id,'reward',reward,'at',claimed_at) order by claimed_at desc),'[]') into rewards from kizuna_private.kizuna_anomaly_claims where user_id=u;
 select a.selection into selection from kizuna_private.kizuna_anomaly_cosmetics a where user_id=u;
 return jsonb_build_object('events',events,'rewards',rewards,'selection',coalesce(selection,'{}'),'server_now',floor(extract(epoch from now())*1000));
end; $$;
create function public.kizuna_anomalies(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select kizuna_private.kizuna_anomalies(p_action,p_payload);$$;
revoke all on function kizuna_private.anomaly_validate(jsonb,boolean),kizuna_private.anomaly_measure(uuid,jsonb,timestamptz,timestamptz),kizuna_private.anomaly_enrol(uuid),kizuna_private.kizuna_anomalies(text,jsonb),public.kizuna_anomalies(text,jsonb) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_anomalies(text,jsonb),public.kizuna_anomalies(text,jsonb) to authenticated;
