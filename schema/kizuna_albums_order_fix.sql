-- Qualify the adopted card ID; both projected columns otherwise have the name id.
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
  if p_action='list_albums' then
    if p_payload<>'{}'::jsonb then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    select coalesce(jsonb_agg(private.kizuna_album_value(id) order by lower(name),id),'[]'::jsonb)
      into v_albums from (select id,name from public.kizuna_albums order by lower(name),id limit 1000) a;
    return jsonb_build_object('albums',v_albums,'hasMore',(select count(*)>1000 from public.kizuna_albums));
  end if;
  if p_action='create_album' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('animeId','name','coverImage'))
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
    -- Same-anime retries serialize and reuse the existing album, including its
    -- chosen name, image and membership. No previous customisation is reset.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kizuna-album:'||v_anime_id::text,574039));
    select * into v_album from public.kizuna_albums where anime_id=v_anime_id for update;
    if found then return jsonb_build_object('album',private.kizuna_album_value(v_album.id)); end if;
    begin
      insert into public.kizuna_albums(name,anime_id,cover_image) values(v_name,v_anime_id,v_cover) returning * into v_album;
    exception when unique_violation then
      select * into v_album from public.kizuna_albums where anime_id=v_anime_id;
      if found then return jsonb_build_object('album',private.kizuna_album_value(v_album.id)); end if;
      raise exception 'ALBUM_NAME_TAKEN' using errcode='23505';
    end;
    -- Adopt only exact case-insensitive series matches, never fuzzy/franchise
    -- matches. Existing card identities and rarities are left untouched.
    insert into public.kizuna_album_cards(album_id,card_id)
      select v_album.id,c.id from public.kizuna_cards c
      where lower(c.card->>'series')=lower(v_name) order by c.id limit 5001;
    select count(*) into v_count from public.kizuna_album_cards where album_id=v_album.id;
    if v_count>5000 then raise exception 'ALBUM_CARD_LIMIT' using errcode='22003'; end if;
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
    if v_changed>0 then
      insert into private.kizuna_staff_audit(actor_id,action,target_id,details)
        values(p_actor,p_action,v_album_id,jsonb_build_object('cardId',v_card_id));
    end if;
    return jsonb_build_object('album',private.kizuna_album_value(v_album_id));
  end if;
  raise exception 'INVALID_ACTION' using errcode='22023';
end;
$$;
