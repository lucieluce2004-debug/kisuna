-- Lots 3–6: additive cosmetic progression. Legacy game states remain untouched.
begin;
create schema if not exists kizuna_private;
revoke all on schema kizuna_private from public,anon,authenticated;
create table public.kizuna_adventure_definitions (
 id text primary key check(id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
 kind text not null check(kind in ('constellation','mission','event','announcement')),
 title text not null check(char_length(title) between 2 and 90),
 description text not null default '' check(char_length(description)<=1200),
 universe text not null default '' check(char_length(universe)<=160),
 requirements jsonb not null default '{"metric":"total","goal":1}',
 period text not null default 'once' check(period in ('once','day','week')),
 reward_kind text not null default 'badge' check(reward_kind in ('badge','title','decoration')),
 reward_label text not null check(char_length(reward_label) between 1 and 90),
 source_url text not null default '' check(source_url='' or source_url ~ '^https://'),
 starts_at timestamptz, ends_at timestamptz,
 enabled boolean not null default false, secret boolean not null default false,
 revision integer not null default 1, updated_at timestamptz not null default now(),
 check(ends_at is null or (starts_at is not null and ends_at>starts_at)),
 check(jsonb_typeof(requirements)='object' and octet_length(requirements::text)<16000)
);
alter table public.kizuna_adventure_definitions enable row level security;
revoke all on public.kizuna_adventure_definitions from public,anon,authenticated;
grant select on public.kizuna_adventure_definitions to anon,authenticated;
create policy kizuna_adventure_definition_read on public.kizuna_adventure_definitions for select to anon,authenticated using(enabled);

create table kizuna_private.kizuna_adventure_players(
 user_id uuid primary key references public.kizuna_profiles(id) on delete cascade,
 state jsonb not null default '{"claims":{},"awakened":{},"visits":{},"sanctuary":{"public":false,"theme":"night","frame":"simple","decoration":"stars","title":"","featured":"","cards":[],"favorites":[]}}',
 revision bigint not null default 0, updated_at timestamptz not null default now(),
 check(jsonb_typeof(state)='object' and octet_length(state::text)<=2097152)
);
alter table kizuna_private.kizuna_adventure_players enable row level security;
revoke all on kizuna_private.kizuna_adventure_players from public,anon,authenticated;

create table public.kizuna_sanctuaries(
 user_id uuid primary key references public.kizuna_profiles(id) on delete cascade,
 username text not null, presentation jsonb not null,
 is_public boolean not null default false, updated_at timestamptz not null default now(),
 check(octet_length(presentation::text)<=32768)
);
alter table public.kizuna_sanctuaries enable row level security;
revoke all on public.kizuna_sanctuaries from public,anon,authenticated;
grant select on public.kizuna_sanctuaries to anon,authenticated;
create policy kizuna_sanctuary_public on public.kizuna_sanctuaries for select to anon,authenticated using(is_public);
create index kizuna_sanctuaries_public_recent on public.kizuna_sanctuaries(updated_at desc,user_id) where is_public;

create function kizuna_private.kizuna_adventure_value(d jsonb, snap jsonb, progress jsonb, boundary numeric)
returns integer language plpgsql stable security invoker set search_path='' as $$
declare metric text:=d#>>'{requirements,metric}'; result integer:=0; owned jsonb:=coalesce(snap->'owned','[]');
begin
 select owned||coalesce(jsonb_agg(x->'reservedCopy'),'[]') into owned
 from jsonb_array_elements(coalesce(snap#>'{market,listings}','[]')) x
 where x->>'status'='active' and x->>'seller'=snap->>'username' and jsonb_typeof(x->'reservedCopy')='object';
 if metric in ('cards','total','universe','discoveries') then
   select count(*) into result from (
    select c.id,min(case when (x->>'at') ~ '^[0-9]{1,16}$' then (x->>'at')::numeric else 0 end) first_at
    from jsonb_array_elements(owned) x join public.kizuna_cards c on c.id=x->>'id'
    where (metric<>'cards' or (d#>'{requirements,card_ids}') ? c.id)
      and (metric<>'universe' or c.card->>'series'=d#>>'{requirements,universe}') group by c.id
   ) counted where metric<>'discoveries' or (first_at>=boundary and first_at<=extract(epoch from now())*1000);
 elsif metric='visits' then
   select count(*) into result from jsonb_each_text(progress->'visits') x where x.value::numeric>=boundary and x.value::numeric<=extract(epoch from now())*1000;
 elsif metric='awakenings' then
   select count(*) into result from jsonb_each_text(progress->'awakened') x where x.value::integer>0;
 elsif metric='constellations' then
   select count(*) into result from jsonb_each(progress->'claims') x where x.value->>'kind'='constellation';
 end if;
 return result;
end; $$;
revoke all on function kizuna_private.kizuna_adventure_value(jsonb,jsonb,jsonb,numeric) from public,anon,authenticated;

create function kizuna_private.kizuna_adventure(p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); username_value text; player kizuna_private.kizuna_adventure_players; snap jsonb;
 d public.kizuna_adventure_definitions; next_state jsonb; item text; k text; boundary numeric:=0; score integer; goal integer;
 claims jsonb; setting jsonb; canonical text; level integer; amount integer; is_admin boolean;
 definitions jsonb; now_ms numeric:=floor(extract(epoch from now())*1000); selected jsonb; ids jsonb; edge jsonb;
begin
 if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select p.username into username_value from public.kizuna_profiles p where p.id=actor;
 if username_value is null then raise exception 'PROFILE_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>64000 then raise exception 'INVALID_PAYLOAD';end if;
 select exists(select 1 from public.kizuna_admins a where a.user_id=actor) into is_admin;
 if p_action='definition_save' then
   if not is_admin then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
   perform pg_advisory_xact_lock(hashtextextended('kizuna_adventure_definitions',0));
   item:=p_payload->>'id';
   if item is null or item !~ '^[a-z0-9][a-z0-9-]{1,79}$' then raise exception 'INVALID_ID';end if;
   select * into d from public.kizuna_adventure_definitions where id=item for update;
   if found and coalesce((p_payload->>'revision')::integer,-1)<>d.revision then raise exception 'REVISION_CONFLICT';end if;
   setting:=p_payload->'requirements';
   if setting is null or jsonb_typeof(setting)<>'object' or coalesce(setting->>'metric','') not in ('cards','total','universe','visits','awakenings','constellations','discoveries') then raise exception 'INVALID_METRIC';end if;
   if coalesce(setting->>'goal','') !~ '^[0-9]{1,4}$' or (setting->>'goal')::integer not between 1 and 5000 then raise exception 'INVALID_GOAL';end if;
   if setting->>'metric'='cards' then
     if jsonb_typeof(setting->'card_ids') is distinct from 'array' or jsonb_array_length(setting->'card_ids') not between 2 and 12 then raise exception 'INVALID_MEMBERS';end if;
     select count(distinct c.source_id) into amount from jsonb_array_elements_text(setting->'card_ids') x(id) join public.kizuna_cards c on c.id=x.id;
     if amount<>jsonb_array_length(setting->'card_ids') then raise exception 'INVALID_MEMBERS';end if;
     setting:=jsonb_set(setting,'{goal}',to_jsonb(amount));
     if p_payload->>'kind'='constellation' then
       p_payload:=jsonb_set(p_payload,'{period}','"once"');
       if jsonb_typeof(setting->'edges') is distinct from 'array' or jsonb_array_length(setting->'edges') not between 1 and 36 then raise exception 'INVALID_LINKS';end if;
       for edge in select jsonb_array_elements(setting->'edges') loop
         if jsonb_typeof(edge) is distinct from 'array' or jsonb_array_length(edge)<>3 then raise exception 'INVALID_LINKS';end if;
         if coalesce(edge->>0,'') !~ '^[0-9]{1,2}$' or coalesce(edge->>1,'') !~ '^[0-9]{1,2}$' or coalesce(char_length(edge->>2),0) not between 1 and 60 then raise exception 'INVALID_LINKS';end if;
         if (edge->>0)::integer>=amount or (edge->>1)::integer>=amount or edge->>0=edge->>1 then raise exception 'INVALID_LINKS';end if;
       end loop;
     end if;
     if p_payload->>'kind'='constellation' and coalesce(p_payload->>'source_url','') !~ '^https://' then raise exception 'SOURCE_REQUIRED';end if;
   elsif p_payload->>'kind'='constellation' then raise exception 'CONSTELLATION_REQUIRES_CARDS';
   end if;
   if setting->>'metric'='universe' and not exists(select 1 from public.kizuna_cards c where c.card->>'series'=setting->>'universe') then raise exception 'INVALID_UNIVERSE';end if;
   if p_payload->>'kind'='event' and (nullif(p_payload->>'starts_at','') is null or nullif(p_payload->>'ends_at','') is null) then raise exception 'EVENT_DATES_REQUIRED';end if;
   insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,starts_at,ends_at,enabled,secret)
   values(item,p_payload->>'kind',btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'universe',''),setting,coalesce(p_payload->>'period','once'),coalesce(p_payload->>'reward_kind','badge'),btrim(p_payload->>'reward_label'),coalesce(p_payload->>'source_url',''),nullif(p_payload->>'starts_at','')::timestamptz,nullif(p_payload->>'ends_at','')::timestamptz,coalesce((p_payload->>'enabled')::boolean,false),coalesce((p_payload->>'secret')::boolean,false))
   on conflict(id) do update set kind=excluded.kind,title=excluded.title,description=excluded.description,universe=excluded.universe,requirements=excluded.requirements,period=excluded.period,reward_kind=excluded.reward_kind,reward_label=excluded.reward_label,source_url=excluded.source_url,starts_at=excluded.starts_at,ends_at=excluded.ends_at,enabled=excluded.enabled,secret=excluded.secret,revision=kizuna_adventure_definitions.revision+1,updated_at=now();
   insert into private.kizuna_staff_audit(actor_id,action,details) values(actor,'adventure_definition',jsonb_build_object('id',item,'enabled',p_payload->'enabled'));
   p_action:='get';
 end if;
 insert into kizuna_private.kizuna_adventure_players(user_id) values(actor) on conflict do nothing;
 select * into player from kizuna_private.kizuna_adventure_players where user_id=actor for update;
 next_state:=player.state;
 select snapshot into snap from public.kizuna_player_states where user_id=actor;
 snap:=coalesce(snap,'{"owned":[],"market":{}}');
 if p_action='claim' then
   select * into d from public.kizuna_adventure_definitions where id=p_payload->>'id' and enabled;
   if not found or d.kind='announcement' then raise exception 'DEFINITION_UNAVAILABLE';end if;
   if d.starts_at>now() or d.ends_at<=now() then raise exception 'EVENT_INACTIVE';end if;
   k:=d.id;
   if d.period<>'once' then
     boundary:=extract(epoch from (date_trunc(case when d.period='day' then 'day' else 'week' end,now() at time zone 'UTC') at time zone 'UTC'))*1000;
     k:=k||':'||to_char(to_timestamp(boundary/1000) at time zone 'UTC','YYYY-MM-DD');
   end if;
   if not (next_state->'claims') ? k then
     score:=kizuna_private.kizuna_adventure_value(to_jsonb(d),snap,next_state,boundary);
     goal:=(d.requirements->>'goal')::integer;
     if score<goal then raise exception 'REQUIREMENTS_NOT_MET';end if;
     next_state:=jsonb_set(next_state,array['claims',k],jsonb_build_object('id',d.id,'kind',d.kind,'label',d.reward_label,'reward_kind',d.reward_kind,'at',now_ms));
   end if;
 elsif p_action='awaken' then
   item:=p_payload->>'id'; level:=coalesce((next_state#>>array['awakened',item])::integer,0);
   if not exists(select 1 from public.kizuna_cards where id=item) then raise exception 'CARD_NOT_FOUND';end if;
   if (p_payload->>'level')::integer=level then p_action:='get';
   elsif coalesce((p_payload->>'level')::integer,-1)<>level+1 or level>=2 then raise exception 'INVALID_AWAKENING_LEVEL';
   else
     select count(*) into amount from jsonb_array_elements(snap->'owned') x where x->>'id'=item;
     if amount<(case when level=0 then 2 else 5 end) then raise exception 'REQUIREMENTS_NOT_MET';end if;
     next_state:=jsonb_set(next_state,array['awakened',item],to_jsonb(level+1));
   end if;
 elsif p_action='visit' then
   item:=p_payload->>'universe';
   if not exists(select 1 from public.kizuna_cards c where c.card->>'series'=item) then raise exception 'INVALID_UNIVERSE';end if;
   next_state:=jsonb_set(next_state,array['visits',item],to_jsonb(now_ms));
 elsif p_action='sanctuary' then
   if coalesce((p_payload->>'revision')::bigint,-1)<>player.revision then raise exception 'REVISION_CONFLICT';end if;
   setting:=p_payload->'settings';
   if jsonb_typeof(setting) is distinct from 'object' or coalesce(setting->>'theme','') not in ('night','mist','aurora') or coalesce(setting->>'frame','') not in ('simple','awakened','prestige') or coalesce(setting->>'decoration','') not in ('stars','petals','orbits') then raise exception 'INVALID_STYLE';end if;
   select count(*) into amount from jsonb_each(next_state->'claims');
   if setting->>'theme'='aurora' and amount<1 then raise exception 'STYLE_LOCKED';end if;
   if setting->>'frame'='prestige' and amount<3 then raise exception 'STYLE_LOCKED';end if;
   if setting->>'frame'='awakened' and next_state->'awakened'='{}'::jsonb then raise exception 'STYLE_LOCKED';end if;
   if setting->>'decoration'='orbits' and amount<1 then raise exception 'STYLE_LOCKED';end if;
   if coalesce(setting->>'title','')<>'' and not exists(select 1 from jsonb_each(next_state->'claims') c where c.value->>'label'=setting->>'title') then raise exception 'TITLE_LOCKED';end if;
   if jsonb_typeof(setting->'cards') is distinct from 'array' or jsonb_array_length(setting->'cards')>6 or jsonb_typeof(setting->'favorites') is distinct from 'array' or jsonb_array_length(setting->'favorites')>24 then raise exception 'INVALID_SELECTION';end if;
   ids:=(setting->'cards')||(setting->'favorites');
   if coalesce(setting->>'featured','')<>'' then
     if not exists(select 1 from public.kizuna_cards where id=setting->>'featured' and card->>'rarity'='Mythique') then raise exception 'MYTHIC_REQUIRED';end if;
     ids:=ids||jsonb_build_array(setting->>'featured');
   end if;
   for item in select jsonb_array_elements_text(ids) loop
     if not exists(select 1 from public.kizuna_cards where id=item) or not exists(select 1 from jsonb_array_elements(snap->'owned') x where x->>'id'=item) then raise exception 'OWNED_CARD_REQUIRED';end if;
   end loop;
   if (select count(distinct x) from jsonb_array_elements_text(setting->'cards') x)<>jsonb_array_length(setting->'cards') then raise exception 'DUPLICATE_DISPLAY_CARD';end if;
   setting:=jsonb_build_object('public',coalesce((setting->>'public')::boolean,false),'theme',setting->>'theme','frame',setting->>'frame','decoration',setting->>'decoration','title',coalesce(setting->>'title',''),'featured',coalesce(setting->>'featured',''),'cards',setting->'cards','favorites',setting->'favorites');
   next_state:=jsonb_set(next_state,'{sanctuary}',setting);
   select coalesce(jsonb_agg(c.value order by c.value->>'at'),'[]') into claims from jsonb_each(next_state->'claims') c;
   selected:=jsonb_build_object('settings',setting-'public'-'favorites','badges',(select coalesce(jsonb_agg(x),'[]') from (select distinct value->>'label' x from jsonb_array_elements(claims) limit 40) b),'constellations',(select coalesce(jsonb_agg(value->>'id'),'[]') from jsonb_array_elements(claims) where value->>'kind'='constellation'),'awakened',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(next_state->'awakened') where (setting->'cards') ? key or setting->>'featured'=key));
   insert into public.kizuna_sanctuaries(user_id,username,presentation,is_public) values(actor,username_value,selected,(setting->>'public')::boolean)
   on conflict(user_id) do update set username=excluded.username,presentation=excluded.presentation,is_public=excluded.is_public,updated_at=now();
 elsif p_action='private' then
   -- Privacy can always be revoked, even after a displayed card is sold.
   next_state:=jsonb_set(next_state,'{sanctuary,public}','false');
   update public.kizuna_sanctuaries set is_public=false,updated_at=now() where user_id=actor;
 elsif p_action<>'get' then raise exception 'UNKNOWN_ACTION';
 end if;
 if next_state<>player.state then
   update kizuna_private.kizuna_adventure_players set state=next_state,revision=revision+1,updated_at=now() where user_id=actor returning * into player;
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.kind,x.title),'[]') into definitions from public.kizuna_adventure_definitions x where x.enabled or is_admin;
 return jsonb_build_object('state',player.state,'revision',player.revision,'definitions',definitions,'server_now',now_ms);
end; $$;
create function public.kizuna_adventure(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select kizuna_private.kizuna_adventure(p_action,p_payload); $$;
revoke all on function kizuna_private.kizuna_adventure(text,jsonb),public.kizuna_adventure(text,jsonb) from public,anon,authenticated;
grant usage on schema kizuna_private to authenticated;
grant execute on function kizuna_private.kizuna_adventure(text,jsonb),public.kizuna_adventure(text,jsonb) to authenticated;

-- Publisher-backed initial definitions. No active event is fabricated.
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('rivals-konoha','constellation','Deux chemins, un lien','Naruto et Sasuke, deux rivaux liés par leur parcours au sein de l’équipe 7.','Naruto','{"metric":"cards","card_ids":["cseed-0013","cseed-0014"],"goal":2,"edges":[[0,1,"Rivaux"]]}','once','title','Les liens de Konoha','https://naruto-official.com/en/news/01_1296',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('brothers-uchiha','constellation','Héritage des Uchiha','Sasuke et son frère aîné Itachi. Réunis les deux personnages pour compléter ce lien.','Naruto','{"metric":"cards","card_ids":["cseed-0014","cseed-0017"],"goal":2,"edges":[[0,1,"Frères"]]}','once','title','Héritage écarlate','https://naruto-official.com/en/anime/naruto1/list/01_353',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('team-seven','constellation','L’équipe 7','Naruto, Sasuke et Sakura forment l’équipe 7 sous la direction de Kakashi.','Naruto','{"metric":"cards","card_ids":["cseed-0013","cseed-0014","cseed-0015","cseed-0016"],"goal":4,"edges":[[3,0,"Maître et élève"],[3,1,"Maître et élève"],[3,2,"Maître et élève"],[0,1,"Coéquipiers"],[1,2,"Coéquipiers"]]}','once','title','L’esprit de l’équipe 7','https://naruto-official.com/en/news/01_1610',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('saiyan-rivals','constellation','Au-delà des limites','Goku et Vegeta : une rivalité qui les pousse à se dépasser.','Dragon Ball','{"metric":"cards","card_ids":["cseed-0089","cseed-0090"],"goal":2,"edges":[[0,1,"Rivaux"]]}','once','title','Fierté des Saiyans','https://en.dragon-ball-official.com/news/01_1189.html',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('first-collection','mission','Premiers liens','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"total","goal":5}','once','badge','Premiers liens','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('collector-25','mission','Un nouvel horizon','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"total","goal":25}','once','badge','Collectionneur des horizons','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('collector-100','mission','Cent rencontres','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"total","goal":100}','once','badge','Cent rencontres','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('traveller','mission','D’un univers à l’autre','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"visits","goal":5}','once','badge','Voyageur','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('first-constellation','mission','Les étoiles se rejoignent','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"constellations","goal":1}','once','badge','Tisseur de liens','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('first-awakening','mission','Une nouvelle lumière','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"awakenings","goal":1}','once','badge','Éveilleur','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('daily-explore','mission','L’escale du jour','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"visits","goal":1}','day','badge','Éclat du jour','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('daily-discovery','mission','Une découverte du jour','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"discoveries","goal":1}','day','badge','Nouvelle rencontre','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('weekly-explore','mission','La traversée de la semaine','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"visits","goal":3}','week','badge','Carnet de voyage','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('weekly-discovery','mission','Les rencontres de la semaine','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"discoveries","goal":5}','week','badge','Chroniqueur','',true,false) on conflict(id) do nothing;
insert into public.kizuna_adventure_definitions(id,kind,title,description,universe,requirements,period,reward_kind,reward_label,source_url,enabled,secret) values ('hidden-awakening','mission','Une constellation intérieure','Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.','','{"metric":"awakenings","goal":5}','once','badge','Gardien de lumière','',true,true) on conflict(id) do nothing;
commit;
