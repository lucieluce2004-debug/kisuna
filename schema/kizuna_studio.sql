-- Advanced editorial controls, staged publication and optional cosmetic progression.
create table public.kizuna_live_design(id boolean primary key default true check(id),config jsonb not null,revision bigint not null default 1,published_at timestamptz not null default now());
create table kizuna_private.kizuna_studio(id boolean primary key default true check(id),draft jsonb not null,revision bigint not null default 1,published_revision bigint not null default 1,updated_at timestamptz not null default now());
create table kizuna_private.kizuna_studio_history(revision bigint primary key,config jsonb not null,actor uuid references public.kizuna_profiles(id),action text not null,created_at timestamptz not null default now());
alter table public.kizuna_live_design enable row level security;
alter table kizuna_private.kizuna_studio enable row level security;
alter table kizuna_private.kizuna_studio_history enable row level security;
revoke all on public.kizuna_live_design,kizuna_private.kizuna_studio,kizuna_private.kizuna_studio_history from public,anon,authenticated;
grant select on public.kizuna_live_design to anon,authenticated;
create policy kizuna_live_design_read on public.kizuna_live_design for select to anon,authenticated using(true);
insert into public.kizuna_live_design(config) values('{
 "theme":"night","features":{"constellations":true,"missions":true,"journey":true,"awakening":true,"sanctuary":true,"events":true},
 "banner":{"enabled":false,"title":"Chaque carte crée un lien.","body":"","card_id":"","target":"constellations","starts_at":null,"ends_at":null},
 "awakening":{"mode":"all","card_ids":[],"fragments":false},"variants":[]
}');
insert into kizuna_private.kizuna_studio(draft) select config from public.kizuna_live_design;
insert into kizuna_private.kizuna_studio_history(revision,config,action) select 1,config,'initial' from public.kizuna_live_design;

create function kizuna_private.studio_validate(v jsonb,publishing boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f jsonb:='{}';b jsonb;a jsonb;variants jsonb:='[]';x jsonb;k text;ids jsonb;seen text[]:='{}';starts timestamptz;ends timestamptz;
begin
 if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>150000 then raise exception 'INVALID_DESIGN';end if;
 if coalesce(v->>'theme','') not in ('night','aurora','ember') then raise exception 'INVALID_THEME';end if;
 foreach k in array array['constellations','missions','journey','awakening','sanctuary','events'] loop
  if jsonb_typeof(v#>array['features',k]) is distinct from 'boolean' then raise exception 'INVALID_FEATURE';end if;
  f:=f||jsonb_build_object(k,v#>array['features',k]);
 end loop;
 b:=v->'banner';a:=v->'awakening';
 if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'enabled') is distinct from 'boolean' or jsonb_typeof(b->'title') is distinct from 'string' or char_length(b->>'title') not between 2 and 90 or jsonb_typeof(b->'body') is distinct from 'string' or char_length(b->>'body')>400 or coalesce(b->>'target','') not in ('constellations','missions','journey','events','boosters','collection') then raise exception 'INVALID_BANNER';end if;
 if coalesce(b->>'card_id','')<>'' and not exists(select 1 from public.kizuna_cards c where c.id=b->>'card_id') then raise exception 'INVALID_CARD';end if;
 starts:=nullif(b->>'starts_at','')::timestamptz;ends:=nullif(b->>'ends_at','')::timestamptz;
 if ends is not null and (starts is null or ends<=starts) then raise exception 'INVALID_DATES';end if;
 b:=jsonb_build_object('enabled',b->'enabled','title',btrim(b->>'title'),'body',b->>'body','card_id',coalesce(b->>'card_id',''),'target',b->>'target','starts_at',starts,'ends_at',ends);
 if jsonb_typeof(a) is distinct from 'object' or coalesce(a->>'mode','') not in ('all','selected') or jsonb_typeof(a->'card_ids') is distinct from 'array' or jsonb_array_length(a->'card_ids')>2000 or jsonb_typeof(a->'fragments') is distinct from 'boolean' then raise exception 'INVALID_AWAKENING';end if;
 if exists(select 1 from jsonb_array_elements(a->'card_ids') q where jsonb_typeof(q)<>'string' or not exists(select 1 from public.kizuna_cards c where c.id=q#>>'{}')) then raise exception 'INVALID_CARD';end if;
 select coalesce(jsonb_agg(z.id order by z.id),'[]') into ids from (select distinct jsonb_array_elements_text(a->'card_ids') id) z;
 a:=jsonb_build_object('mode',a->>'mode','card_ids',ids,'fragments',a->'fragments');
 if jsonb_typeof(v->'variants') is distinct from 'array' or jsonb_array_length(v->'variants')>50 then raise exception 'INVALID_VARIANTS';end if;
 for x in select value from jsonb_array_elements(v->'variants') loop
  if coalesce(x->>'id','') !~ '^[a-z0-9][a-z0-9-]{1,59}$' or (x->>'id')=any(seen) then raise exception 'INVALID_VARIANT_ID';end if;
  seen:=array_append(seen,x->>'id');
  if not exists(select 1 from public.kizuna_cards c where c.id=x->>'card_id') or char_length(coalesce(x->>'label','')) not between 2 and 80 or coalesce(x->>'level','') not in ('0','1','2') or jsonb_typeof(x->'enabled') is distinct from 'boolean' or jsonb_typeof(x->'approved') is distinct from 'boolean' then raise exception 'INVALID_VARIANT';end if;
  -- Browser image URLs only; never fetched by a privileged server.
  if coalesce(x->>'image','') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}/[^[:space:]<>"\\]+\.(png|jpe?g|webp|avif)(\?[^[:space:]<>"\\]*)?$' or coalesce(x->>'source','') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}/[^[:space:]<>"\\]*$' then raise exception 'INVALID_IMAGE_URL';end if;
  if publishing and (x->>'enabled')::boolean and not (x->>'approved')::boolean then raise exception 'ART_APPROVAL_REQUIRED';end if;
  variants:=variants||jsonb_build_array(jsonb_build_object('id',x->>'id','card_id',x->>'card_id','label',btrim(x->>'label'),'image',x->>'image','source',x->>'source','level',(x->>'level')::integer,'enabled',x->'enabled','approved',x->'approved'));
 end loop;
 return jsonb_build_object('theme',v->>'theme','features',f,'banner',b,'awakening',a,'variants',variants);
end; $$;
create function kizuna_private.kizuna_studio(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s kizuna_private.kizuna_studio;v jsonb;history jsonb;
begin
 if actor is null or not exists(select 1 from public.kizuna_admins a where a.user_id=actor) then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>160000 then raise exception 'INVALID_INPUT';end if;
 select * into strict s from kizuna_private.kizuna_studio where id for update;
 if p_action in ('save','publish','restore') then
  if coalesce((p_payload->>'revision')::bigint,-1)<>s.revision then raise exception 'REVISION_CONFLICT';end if;
  if p_action='save' then v:=kizuna_private.studio_validate(p_payload->'config');
  elsif p_action='restore' then
   select h.config into v from kizuna_private.kizuna_studio_history h where h.revision=(p_payload->>'target')::bigint;
   if v is null then raise exception 'VERSION_NOT_FOUND';end if;v:=kizuna_private.studio_validate(v);
  else v:=kizuna_private.studio_validate(s.draft,true);end if;
  update kizuna_private.kizuna_studio set draft=v,revision=revision+1,updated_at=now() where id returning * into s;
  insert into kizuna_private.kizuna_studio_history(revision,config,actor,action) values(s.revision,v,actor,p_action);
  if p_action='publish' then
   -- Draft art and its approval status are not exposed to visitors.
   select jsonb_set(v,'{variants}',coalesce(jsonb_agg(x-'approved'),'[]')) into v from jsonb_array_elements(v->'variants') x where (x->>'enabled')::boolean and (x->>'approved')::boolean;
   update public.kizuna_live_design set config=v,revision=s.revision,published_at=now() where id;
   update kizuna_private.kizuna_studio set published_revision=s.revision where id returning * into s;
  end if;
  insert into private.kizuna_staff_audit(actor_id,action,details) values(actor,'studio_'||p_action,jsonb_build_object('revision',s.revision));
 elsif p_action<>'get' then raise exception 'INVALID_ACTION';end if;
 select coalesce(jsonb_agg(x order by x.revision desc),'[]') into history from (select h.revision,h.action,h.created_at from kizuna_private.kizuna_studio_history h order by h.revision desc limit 20) x;
 return jsonb_build_object('draft',s.draft,'revision',s.revision,'publishedRevision',s.published_revision,'live',(select config from public.kizuna_live_design where id),'history',history);
end; $$;
create function public.kizuna_studio(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select kizuna_private.kizuna_studio(p_action,p_payload);$$;
revoke all on function kizuna_private.studio_validate(jsonb,boolean),kizuna_private.kizuna_studio(text,jsonb),public.kizuna_studio(text,jsonb) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_studio(text,jsonb),public.kizuna_studio(text,jsonb) to authenticated;

-- Preserve the tested adventure implementation behind a guarded entry point.
alter function kizuna_private.kizuna_adventure(text,jsonb) rename to kizuna_adventure_core;
revoke all on function kizuna_private.kizuna_adventure_core(text,jsonb) from public,anon,authenticated;
create function kizuna_private.kizuna_adventure(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();cfg jsonb;s jsonb;before_claims jsonb;result jsonb;feature text;item text;v jsonb;oldlevel integer;wanted integer;cost integer;balance integer;changed boolean:=false;
begin
 if actor is null or not exists(select 1 from public.kizuna_profiles p where p.id=actor) then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000 then raise exception 'INVALID_PAYLOAD';end if;
 -- Same lock order as economic operations; never consume an escrowed copy.
 perform pg_advisory_xact_lock(17493,700);
 select config into strict cfg from public.kizuna_live_design where id;
 feature:=case p_action when 'awaken' then 'awakening' when 'visit' then 'journey' when 'sanctuary' then 'sanctuary' else null end;
 if p_action='claim' then select case d.kind when 'constellation' then 'constellations' when 'event' then 'events' else 'missions' end into feature from public.kizuna_adventure_definitions d where d.id=p_payload->>'id';end if;
 if feature is not null and cfg#>>array['features',feature]='false' then raise exception 'FEATURE_DISABLED';end if;
 insert into kizuna_private.kizuna_adventure_players(user_id) values(actor) on conflict do nothing;
 select p.state into strict s from kizuna_private.kizuna_adventure_players p where p.user_id=actor for update;
 before_claims:=s->'claims';balance:=coalesce((s->>'fragments')::integer,0);item:=p_payload->>'id';
 if p_action='awaken' then
  if cfg#>>'{awakening,mode}'='selected' and not (cfg#>'{awakening,card_ids}') ? item then raise exception 'CARD_NOT_ELIGIBLE';end if;
  if coalesce(p_payload->>'method','copies') not in ('copies','fragments') then raise exception 'INVALID_METHOD';end if;
 end if;
 if p_action='awaken' and p_payload->>'method'='fragments' then
  if cfg#>>'{awakening,fragments}'<>'true' then raise exception 'FRAGMENTS_DISABLED';end if;
  if not exists(select 1 from public.kizuna_player_states p,jsonb_array_elements(p.snapshot->'owned') o where p.user_id=actor and o->>'id'=item) then raise exception 'OWNED_CARD_REQUIRED';end if;
  oldlevel:=coalesce((s#>>array['awakened',item])::integer,0);wanted:=coalesce((p_payload->>'level')::integer,-1);
  if wanted=oldlevel then null;
  elsif wanted<>oldlevel+1 or wanted>2 then raise exception 'INVALID_AWAKENING_LEVEL';
  else
   cost:=case when wanted=1 then 2 else 5 end;if balance<cost then raise exception 'INSUFFICIENT_FRAGMENTS';end if;
   s:=jsonb_set(jsonb_set(s,'{fragments}',to_jsonb(balance-cost)),array['awakened',item],to_jsonb(wanted));changed:=true;
  end if;
 elsif p_action='equip_art' then
  if not exists(select 1 from public.kizuna_cards c where c.id=item) then raise exception 'CARD_NOT_FOUND';end if;
  if coalesce(p_payload->>'variant','')='' then
   s:=jsonb_set(s,'{art}',coalesce(s->'art','{}')-item);changed:=true;
  else
   select x into v from jsonb_array_elements(cfg->'variants') x where x->>'id'=p_payload->>'variant' and x->>'card_id'=item;
   if v is null then raise exception 'VARIANT_UNAVAILABLE';end if;
   if not exists(select 1 from public.kizuna_player_states p,jsonb_array_elements(p.snapshot->'owned') o where p.user_id=actor and o->>'id'=item) then raise exception 'OWNED_CARD_REQUIRED';end if;
   if coalesce((s#>>array['awakened',item])::integer,0)<(v->>'level')::integer then raise exception 'STYLE_LOCKED';end if;
   s:=jsonb_set(s,'{art}',coalesce(s->'art','{}')||jsonb_build_object(item,p_payload->>'variant'));changed:=true;
  end if;
 else
  result:=kizuna_private.kizuna_adventure_core(p_action,p_payload);s:=result->'state';
  if p_action='claim' and cfg#>>'{awakening,fragments}'='true' and s->'claims'<>before_claims then s:=jsonb_set(s,'{fragments}',to_jsonb(least(100000,balance+1)));changed:=true;end if;
 end if;
 if changed then update kizuna_private.kizuna_adventure_players set state=s,revision=revision+1,updated_at=now() where user_id=actor;end if;
 if result is null or changed then result:=kizuna_private.kizuna_adventure_core('get','{}');end if;
 return result||jsonb_build_object('design',cfg);
end; $$;
revoke all on function kizuna_private.kizuna_adventure(text,jsonb) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_adventure(text,jsonb) to authenticated;
-- Rebind the wrapper explicitly, independently of SQL function body dependency caching.
create or replace function public.kizuna_adventure(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select kizuna_private.kizuna_adventure(p_action,p_payload);$$;
