-- Metadata-only integration checks. No Auth/profile/role/state writes. All
-- temporary cards, albums, memberships and staff audit rows roll back.
begin;
do $$
declare
  actor uuid;album uuid;result jsonb;source_base bigint;anime integer;
  suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
  label text;card_key text;alias_key text;invalid_key text;card_ids text[]:='{}';
  i integer;favourite bigint;rows_found integer;original jsonb;current_values jsonb;
  state_before text;state_after text;
begin
  select a.user_id into actor from public.kizuna_admins a join public.kizuna_profiles p on p.id=a.user_id order by a.created_at limit 1;
  if actor is null then raise exception 'An existing Kizuna administrator is required'; end if;
  label:='QA Mythic '||suffix;
  source_base:=1500000000+floor(random()*100000000)::bigint;
  while exists(select 1 from public.kizuna_cards where source_id between source_base and source_base+10) loop source_base:=source_base+100; end loop;
  anime:=(1800000000+floor(random()*100000000))::integer;
  while exists(select 1 from public.kizuna_albums where anime_id=anime) loop anime:=anime+1; end loop;
  select md5(coalesce(string_agg(user_id::text||':'||snapshot::text||':'||revision::text,'|' order by user_id),'')) into state_before from public.kizuna_player_states;
  if has_function_privilege('authenticated','public.kizuna_catalogue_series_size(text)','execute')
    or has_function_privilege('anon','private.kizuna_rebalance_album_mythics()','execute') then
    raise exception 'Ranking helpers must not be callable from a browser';
  end if;
  for i in 1..8 loop
    card_key:='cqa_myth_'||suffix||'_'||i::text;card_ids:=array_append(card_ids,card_key);
    favourite:=case when i=6 then 8000 else 13000-i*1000 end;
    insert into public.kizuna_cards(id,source_id,card) values(card_key,case when i=6 then null else source_base+i end,
      jsonb_build_object('id',card_key,'sourceId',(source_base+i)::text,'name','QA character '||i,'series',label,
        'image','https://s4.anilist.co/qa-'||suffix||'.jpg','native','保持','fav',favourite,'rarity','Commun','pow',1,'aura',1,'tag','preserved'));
  end loop;
  alias_key:='cqa_myth_alias_'||suffix;
  insert into public.kizuna_cards(id,source_id,card)
    select alias_key,source_id,jsonb_set(card,'{id}',to_jsonb(alias_key)) from public.kizuna_cards where id=card_ids[1];
  invalid_key:='cqa_invalid_'||suffix;
  insert into public.kizuna_cards(id,source_id,card) values(invalid_key,null,
    jsonb_build_object('id',invalid_key,'name','No source','series',label,'fav',999999,'image','https://s4.anilist.co/invalid-qa.jpg'));
  select count(*) into rows_found from public.kizuna_cards where id=any(card_ids[1:5]) and card->>'rarity'='Mythique';
  if rows_found<>5 or (select card->>'rarity' from public.kizuna_cards where id=card_ids[6])<>'Légendaire'
    or (select card->>'rarity' from public.kizuna_cards where id=invalid_key)<>'Rare'
    or (select card->>'rarity' from public.kizuna_cards where id=alias_key)<>'Mythique' then
    raise exception 'Top-five ranking, numeric tie, duplicate-source or invalid-source handling failed';
  end if;
  if private.kizuna_catalogue_series_size(label)<>2 then raise exception 'Bounded series count failed'; end if;
  -- A new favourite leader automatically enters the five; the displaced source
  -- returns to its base rarity without changing its identity or media metadata.
  update public.kizuna_cards set card=jsonb_set(card,'{fav}','14000') where id=card_ids[8];
  if (select card->>'rarity' from public.kizuna_cards where id=card_ids[8])<>'Mythique'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[5])<>'Légendaire' then raise exception 'Favourite update did not rebalance ranks'; end if;
  select jsonb_object_agg(id,card-array['rarity','pow','aura','rarity_policy']) into original
    from public.kizuna_cards where id=any(card_ids) or id in(alias_key,invalid_key);
  -- Two editions of one source are not enough for the two-character minimum.
  begin
    perform public.kizuna_album_dispatch(actor,'create_album',jsonb_build_object('animeId',anime+1,'name','QA duplicate '||suffix,'cardIds',jsonb_build_array(card_ids[1],alias_key)));
    raise exception 'Two editions of one character bypassed the minimum';
  exception when check_violation then if sqlerrm<>'ALBUM_MINIMUM_CHARACTERS' then raise; end if; end;
  result:=public.kizuna_album_dispatch(actor,'create_album',jsonb_build_object('animeId',anime,'name',label));
  album:=(result#>>'{album,id}')::uuid;
  for card_key in select id from public.kizuna_cards where (id=any(card_ids) or id in(alias_key,invalid_key)) and id not in(card_ids[7],card_ids[8]) loop
    perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album,'cardId',card_key));
  end loop;
  if (select count(*) from public.kizuna_album_cards where album_id=album)<>2
    or (select count(*) from public.kizuna_cards where id=any(card_ids) and card->>'rarity'='Mythique')<>2
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[1])<>'Rare' then
    raise exception 'Managed album did not replace the homonymous implicit group';
  end if;
  perform public.kizuna_album_dispatch(actor,'add_album_card',jsonb_build_object('albumId',album,'cardId',card_ids[6]));
  perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album,'cardId',card_ids[7]));
  if (select card->>'rarity' from public.kizuna_cards where id=card_ids[7])<>'Rare' then raise exception 'Removed member retained its album Mythique rank'; end if;
  begin
    perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album,'cardId',card_ids[6]));
    raise exception 'Album was allowed to drop below two distinct characters';
  exception when check_violation then if sqlerrm<>'ALBUM_MINIMUM_CHARACTERS' then raise; end if; end;
  if (select count(*) from public.kizuna_album_cards where album_id=album)<>2 then raise exception 'Rejected removal lost a member'; end if;
  if exists(select 1 from public.kizuna_cards where private.kizuna_card_source(source_id,card)='53901' and card->>'rarity'<>'Mythique') then raise exception 'Explicit Madara exception was lost'; end if;
  select jsonb_object_agg(id,card-array['rarity','pow','aura','rarity_policy']) into current_values
    from public.kizuna_cards where id=any(card_ids) or id in(alias_key,invalid_key);
  if original is distinct from current_values then raise exception 'Ranking changed identity, images or other canonical data'; end if;
  if exists(select 1 from public.kizuna_cards where (id=any(card_ids) or id in(alias_key,invalid_key)) and card->>'rarity_policy' is distinct from 'album-ranks-v2') then raise exception 'Ranking marker missing'; end if;
  select md5(coalesce(string_agg(user_id::text||':'||snapshot::text||':'||revision::text,'|' order by user_id),'')) into state_after from public.kizuna_player_states;
  if state_before is distinct from state_after then raise exception 'Ranking changed player collections, currency or stock'; end if;
end;
$$;
set constraints all immediate;
select 'passed' as top_five,'passed' as source_deduplication,'passed' as automatic_rebalance,
  'passed' as managed_override,'passed' as minimum_two,'passed' as canonical_and_player_preservation;
rollback;
