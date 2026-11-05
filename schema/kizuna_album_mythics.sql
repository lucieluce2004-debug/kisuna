-- Album-based mythical ranking. Only canonical card metadata changes: no
-- collection, player snapshot, stock, currency, identity or image is rewritten.
create function private.kizuna_card_source(p_source bigint,p_card jsonb)
returns text language sql immutable security invoker set search_path='' as $$
  select case
    when p_source between 1 and 9999999999 then p_source::text
    when coalesce(p_card->>'sourceId','') ~ '^[0-9]{1,10}$' then
      case when (p_card->>'sourceId')::bigint>0 then ((p_card->>'sourceId')::bigint)::text else null end
    else null end;
$$;
create function private.kizuna_card_favourites(p_card jsonb)
returns bigint language plpgsql immutable security invoker set search_path='' as $$
declare value double precision;
begin
  if jsonb_typeof(p_card->'fav') not in ('number','string') then return 0; end if;
  value:=(p_card->>'fav')::double precision;
  if value is null or value::text in ('NaN','Infinity','-Infinity') then return 0; end if;
  return greatest(0,least(1000000000,floor(value)))::bigint;
exception when invalid_text_representation or numeric_value_out_of_range then return 0;
end;
$$;
create function private.kizuna_rarity_stats(p_id text,p_rarity text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare h bigint:=7;signed_h bigint;i integer;minimum integer;spread integer;offset_value integer;power integer;
begin
  -- Canonical IDs are ASCII. This matches JavaScript's unsigned hash31 and its
  -- signed 32-bit >>3 operation, including negative remainder in aura.
  for i in 1..char_length(p_id) loop h:=(h*31+ascii(substr(p_id,i,1)))%4294967296; end loop;
  case p_rarity
    when 'Mythique' then minimum:=96;spread:=4;offset_value:=25;
    when 'Légendaire' then minimum:=90;spread:=7;offset_value:=30;
    when 'Épique' then minimum:=84;spread:=10;offset_value:=30;
    when 'Rare' then minimum:=72;spread:=9;offset_value:=26;
    when 'Peu commune' then minimum:=58;spread:=8;offset_value:=16;
    else minimum:=48;spread:=8;offset_value:=14;
  end case;
  signed_h:=case when h>=2147483648 then h-4294967296 else h end;
  power:=minimum+(h%spread)::integer;
  return jsonb_build_object('rarity',p_rarity,'pow',power,'aura',power-offset_value+((signed_h>>3)%3)::integer,'rarity_policy','album-top5-v1');
end;
$$;
create function private.kizuna_rebalance_album_mythics()
returns jsonb language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(17493,500);
  with known as (
    select c.id,c.card,private.kizuna_card_source(c.source_id,c.card) as source,
      private.kizuna_card_favourites(c.card) as fav,lower(btrim(coalesce(c.card->>'series',''))) as series
    from public.kizuna_cards c
  ), memberships as (
    select 'album:'||a.id::text as album_key,k.id,k.source,k.fav
    from public.kizuna_albums a join public.kizuna_album_cards m on m.album_id=a.id join known k on k.id=m.card_id
    union all
    select 'series:'||k.series,k.id,k.source,k.fav from known k
    where k.series<>'' and not exists(select 1 from public.kizuna_albums a where lower(btrim(a.name))=k.series)
  ), characters as (
    select album_key,source,max(fav) as fav from memberships where source is not null group by album_key,source
  ), ranked as (
    select source,row_number() over(partition by album_key order by fav desc,source::bigint asc) as place from characters
  ), mythics as (
    select distinct source from ranked where place<=5
    union select '53901' where exists(select 1 from known where source='53901')
  ), desired as (
    select k.id,case when exists(select 1 from mythics m where m.source=k.source) then 'Mythique'
      when k.fav>=10000 then 'Légendaire' when k.fav>=7000 then 'Épique'
      when k.fav>=4000 then 'Rare' when k.fav>=2000 then 'Peu commune' else 'Commun' end as rarity
    from known k
  ), values_to_write as (
    select d.id,private.kizuna_rarity_stats(d.id,d.rarity) as rarity_values from desired d
  )
  update public.kizuna_cards c set card=c.card||v.rarity_values from values_to_write v
    where c.id=v.id and c.card is distinct from c.card||v.rarity_values;
  get diagnostics changed=row_count;
  return jsonb_build_object('updated',changed);
end;
$$;
create function private.kizuna_catalogue_rank_lock()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Serialize BEFORE rows are locked, preventing opposite-order card updates
  -- from deadlocking while the AFTER trigger reclassifies the shared catalogue.
  perform pg_catalog.pg_advisory_xact_lock(17493,500);
  return null;
end;
$$;
create function private.kizuna_catalogue_rank_after()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if pg_trigger_depth()<=1 then perform private.kizuna_rebalance_album_mythics(); end if;
  return null;
end;
$$;
create trigger kizuna_cards_mythic_lock before insert or update or delete on public.kizuna_cards
  for each statement execute function private.kizuna_catalogue_rank_lock();
create trigger kizuna_cards_mythic_rebalance after insert or update or delete on public.kizuna_cards
  for each statement execute function private.kizuna_catalogue_rank_after();
create trigger kizuna_albums_mythic_lock before insert or update or delete on public.kizuna_albums
  for each statement execute function private.kizuna_catalogue_rank_lock();
create trigger kizuna_albums_mythic_rebalance after insert or update or delete on public.kizuna_albums
  for each statement execute function private.kizuna_catalogue_rank_after();
create trigger kizuna_album_members_mythic_lock before insert or update or delete on public.kizuna_album_cards
  for each statement execute function private.kizuna_catalogue_rank_lock();
create trigger kizuna_album_members_mythic_rebalance after insert or update or delete on public.kizuna_album_cards
  for each statement execute function private.kizuna_catalogue_rank_after();

create function private.kizuna_assert_album_minimum(p_album uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.kizuna_albums where id=p_album) and (
    select count(distinct private.kizuna_card_source(c.source_id,c.card))
    from public.kizuna_album_cards m join public.kizuna_cards c on c.id=m.card_id where m.album_id=p_album
  )<2 then raise exception 'ALBUM_MINIMUM_CHARACTERS' using errcode='23514'; end if;
end;
$$;
create function private.kizuna_album_minimum_constraint()
returns trigger language plpgsql security definer set search_path='' as $$
declare album_uuid uuid;
begin
  if TG_TABLE_NAME='kizuna_albums' then
    perform private.kizuna_assert_album_minimum(new.id);
  elsif TG_TABLE_NAME='kizuna_album_cards' then
    if TG_OP<>'INSERT' then perform private.kizuna_assert_album_minimum(old.album_id); end if;
    if TG_OP<>'DELETE' then perform private.kizuna_assert_album_minimum(new.album_id); end if;
  elsif private.kizuna_card_source(old.source_id,old.card) is distinct from private.kizuna_card_source(new.source_id,new.card) then
    for album_uuid in select album_id from public.kizuna_album_cards where card_id=new.id loop
      perform private.kizuna_assert_album_minimum(album_uuid);
    end loop;
  end if;
  return null;
end;
$$;
-- Check the transaction's final membership, allowing creation and seeding in a
-- single RPC without exposing an empty album at commit.
create constraint trigger kizuna_album_minimum_created after insert on public.kizuna_albums
  deferrable initially deferred for each row execute function private.kizuna_album_minimum_constraint();
create constraint trigger kizuna_album_minimum_members after insert or update or delete on public.kizuna_album_cards
  deferrable initially deferred for each row execute function private.kizuna_album_minimum_constraint();
create constraint trigger kizuna_album_minimum_sources after update on public.kizuna_cards
  deferrable initially deferred for each row execute function private.kizuna_album_minimum_constraint();

-- A bounded service-only read avoids a second AniList request when a new
-- character's existing series already contains enough distinct characters.
create function private.kizuna_catalogue_series_size(p_series text)
returns bigint language sql stable security definer set search_path='' as $$
  select count(*) from (
    select distinct private.kizuna_card_source(c.source_id,c.card) as source from public.kizuna_cards c
    where lower(btrim(c.card->>'series'))=lower(btrim(p_series))
      and private.kizuna_card_source(c.source_id,c.card) is not null limit 2
  ) characters;
$$;
create function public.kizuna_catalogue_series_size(p_series text)
returns bigint language sql security invoker set search_path='' as $$
  select private.kizuna_catalogue_series_size(p_series);
$$;

-- Seed new albums before enforcing the two-character invariant.
create or replace function private.kizuna_album_dispatch(p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_album public.kizuna_albums%rowtype;
  v_anime_id integer;
  v_name text;
  v_cover text;
  v_album_id uuid;
  v_card_id text;
  v_count integer;
  v_changed integer;
  v_albums jsonb;
  v_seed_ids text[] := '{}';
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor and is_anonymous=false) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if not exists(select 1 from public.kizuna_admins where user_id=p_actor) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'INVALID_INPUT' using errcode='22023';
  end if;
  if p_action<>'list_albums' then perform pg_catalog.pg_advisory_xact_lock(17493,500); end if;
  if p_action='list_albums' then
    if p_payload<>'{}'::jsonb then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    select coalesce(jsonb_agg(private.kizuna_album_value(id) order by lower(name),id),'[]'::jsonb)
      into v_albums from (select id,name from public.kizuna_albums order by lower(name),id limit 1000) a;
    return jsonb_build_object('albums',v_albums,'hasMore',(select count(*)>1000 from public.kizuna_albums));
  end if;
  if p_action='create_album' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('animeId','name','coverImage','cardIds'))
      or jsonb_typeof(p_payload->'animeId') is distinct from 'number'
      or p_payload->>'animeId' !~ '^[1-9][0-9]{0,9}$'
      or jsonb_typeof(p_payload->'name') is distinct from 'string'
      or (p_payload ? 'coverImage' and jsonb_typeof(p_payload->'coverImage') is distinct from 'string') then
      raise exception 'INVALID_INPUT' using errcode='22023';
    end if;
    if (p_payload->>'animeId')::numeric>2147483647 then
      raise exception 'INVALID_INPUT' using errcode='22023';
    end if;
    v_anime_id:=(p_payload->>'animeId')::integer;
    v_name:=btrim(p_payload->>'name');v_cover:=coalesce(p_payload->>'coverImage','');
    if char_length(v_name) not between 2 and 120 or v_name ~ '[[:cntrl:]]'
      or char_length(v_cover)>1500 or (v_cover<>'' and v_cover !~ '^https://([A-Za-z0-9-]+\.)*anilist\.co(/[^[:cntrl:]]*)?$') then
      raise exception 'INVALID_INPUT' using errcode='22023';
    end if;
    if p_payload ? 'cardIds' then
      if jsonb_typeof(p_payload->'cardIds') is distinct from 'array' or jsonb_array_length(p_payload->'cardIds')>5 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements(p_payload->'cardIds') value where jsonb_typeof(value)<>'string' or char_length(value#>>'{}') not between 1 and 120) then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
      select coalesce(array_agg(value),'{}'::text[]) into v_seed_ids from jsonb_array_elements_text(p_payload->'cardIds');
      if exists(select 1 from unnest(v_seed_ids) value where not exists(select 1 from public.kizuna_cards c where c.id=value)) then raise exception 'CARD_NOT_FOUND' using errcode='P0002'; end if;
    end if;
    -- Same-anime retries serialize and reuse the existing album, including its
    -- chosen name, image and membership. No previous customisation is reset.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kizuna-album:'||v_anime_id::text,574039));
    select * into v_album from public.kizuna_albums where anime_id=v_anime_id for update;
    if found then
      if (select count(distinct private.kizuna_card_source(c.source_id,c.card)) from public.kizuna_album_cards m join public.kizuna_cards c on c.id=m.card_id where m.album_id=v_album.id)<2 then
        insert into public.kizuna_album_cards(album_id,card_id) select v_album.id,value from unnest(v_seed_ids) value on conflict do nothing;
      end if;
      perform private.kizuna_assert_album_minimum(v_album.id);
      return jsonb_build_object('album',private.kizuna_album_value(v_album.id));
    end if;
    begin
      insert into public.kizuna_albums(name,anime_id,cover_image) values(v_name,v_anime_id,v_cover) returning * into v_album;
    exception when unique_violation then
      select * into v_album from public.kizuna_albums where anime_id=v_anime_id;
      if found then
      if (select count(distinct private.kizuna_card_source(c.source_id,c.card)) from public.kizuna_album_cards m join public.kizuna_cards c on c.id=m.card_id where m.album_id=v_album.id)<2 then
        insert into public.kizuna_album_cards(album_id,card_id) select v_album.id,value from unnest(v_seed_ids) value on conflict do nothing;
      end if;
      perform private.kizuna_assert_album_minimum(v_album.id);
      return jsonb_build_object('album',private.kizuna_album_value(v_album.id));
    end if;
      raise exception 'ALBUM_NAME_TAKEN' using errcode='23505';
    end;
    -- Adopt only exact case-insensitive series matches, never fuzzy/franchise
    -- matches. Identities stay intact; statement triggers update rarity only.
    insert into public.kizuna_album_cards(album_id,card_id)
      select v_album.id,c.id from public.kizuna_cards c
      where lower(c.card->>'series')=lower(v_name) order by c.id limit 5001;
    insert into public.kizuna_album_cards(album_id,card_id) select v_album.id,value from unnest(v_seed_ids) value on conflict do nothing;
    select count(*) into v_count from public.kizuna_album_cards where album_id=v_album.id;
    if v_count>5000 then raise exception 'ALBUM_CARD_LIMIT' using errcode='22003'; end if;
    perform private.kizuna_assert_album_minimum(v_album.id);
    insert into private.kizuna_staff_audit(actor_id,action,target_id,details)
      values(p_actor,'create_album',v_album.id,jsonb_build_object('animeId',v_anime_id,'adoptedCards',v_count));
    return jsonb_build_object('album',private.kizuna_album_value(v_album.id));
  end if;
  if p_action in ('add_album_card','remove_album_card') then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('albumId','cardId'))
      or jsonb_typeof(p_payload->'albumId') is distinct from 'string'
      or p_payload->>'albumId' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or jsonb_typeof(p_payload->'cardId') is distinct from 'string'
      or char_length(p_payload->>'cardId') not between 1 and 120 then
      raise exception 'INVALID_INPUT' using errcode='22023';
    end if;
    v_album_id:=(p_payload->>'albumId')::uuid;v_card_id:=p_payload->>'cardId';
    select * into v_album from public.kizuna_albums where id=v_album_id for update;
    if not found then raise exception 'ALBUM_NOT_FOUND' using errcode='P0002'; end if;
    if not exists(select 1 from public.kizuna_cards where id=v_card_id) then
      raise exception 'CARD_NOT_FOUND' using errcode='P0002';
    end if;
    if p_action='add_album_card' then
      if not exists(select 1 from public.kizuna_album_cards where album_id=v_album_id and card_id=v_card_id) then
        select count(*) into v_count from public.kizuna_album_cards where album_id=v_album_id;
        if v_count>=5000 then raise exception 'ALBUM_CARD_LIMIT' using errcode='22003'; end if;
        insert into public.kizuna_album_cards(album_id,card_id) values(v_album_id,v_card_id) on conflict do nothing;
        get diagnostics v_changed=row_count;
      else v_changed:=0; end if;
    else
      delete from public.kizuna_album_cards where album_id=v_album_id and card_id=v_card_id;
      get diagnostics v_changed=row_count;
    end if;
    perform private.kizuna_assert_album_minimum(v_album_id);
    if v_changed>0 then
      insert into private.kizuna_staff_audit(actor_id,action,target_id,details)
        values(p_actor,p_action,v_album_id,jsonb_build_object('cardId',v_card_id));
    end if;
    return jsonb_build_object('album',private.kizuna_album_value(v_album_id));
  end if;
  raise exception 'INVALID_ACTION' using errcode='22023';
end;
$$;

revoke all on function private.kizuna_card_source(bigint,jsonb),private.kizuna_card_favourites(jsonb),
  private.kizuna_rarity_stats(text,text),private.kizuna_rebalance_album_mythics(),
  private.kizuna_catalogue_rank_lock(),private.kizuna_catalogue_rank_after(),
  private.kizuna_assert_album_minimum(uuid),private.kizuna_album_minimum_constraint(),
  private.kizuna_catalogue_series_size(text) from public,anon,authenticated,service_role;
revoke all on function public.kizuna_catalogue_series_size(text) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.kizuna_catalogue_series_size(text),public.kizuna_catalogue_series_size(text) to service_role;
