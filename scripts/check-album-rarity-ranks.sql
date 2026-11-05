-- Metadata-only, rolled-back checks for all three popularity bands. No Auth,
-- profile, role, player-state, stock, currency or owned-card write is performed.
begin;
do $$
declare
  actor uuid;album_a uuid;album_b uuid;album_c uuid;result jsonb;
  source_base bigint;anime integer;i integer;favourite bigint;
  suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
  label text;card_key text;alias_key text;invalid_key text;card_ids text[]:='{}';
  original jsonb;current_values jsonb;state_before text;state_after text;
begin
  select a.user_id into actor from public.kizuna_admins a join public.kizuna_profiles p on p.id=a.user_id order by a.created_at limit 1;
  if actor is null then raise exception 'An existing Kizuna administrator is required'; end if;
  label:='QA bands '||suffix;source_base:=1600000000+floor(random()*100000000)::bigint;
  while exists(select 1 from public.kizuna_cards where source_id between source_base and source_base+30) loop source_base:=source_base+100; end loop;
  anime:=(1800000000+floor(random()*100000000))::integer;
  while exists(select 1 from public.kizuna_albums where anime_id between anime and anime+3) loop anime:=anime+10; end loop;
  select md5(coalesce(string_agg(user_id::text||':'||snapshot::text||':'||revision::text,'|' order by user_id),'')) into state_before from public.kizuna_player_states;
  if has_function_privilege('anon','private.kizuna_rebalance_album_mythics()','execute')
    or has_function_privilege('authenticated','private.kizuna_rarity_stats(text,text)','execute') then raise exception 'Ranking execution privileges were widened'; end if;
  for i in 1..20 loop
    card_key:='cqa_band_'||suffix||'_'||i::text;card_ids:=array_append(card_ids,card_key);
    favourite:=case when i=17 then 1500 when i=18 then 500 when i=19 then 2500 when i=20 then 1000
      when i in(6,11,16) then 51000-(i-1)*1000 else 51000-i*1000 end;
    insert into public.kizuna_cards(id,source_id,card) values(card_key,case when i=11 then null else source_base+i end,
      jsonb_build_object('id',card_key,'sourceId',(source_base+i)::text,'name','QA ranked character '||i,'series',label,
        'image','https://s4.anilist.co/qa-bands-'||suffix||'.jpg','native','保持','fav',favourite,'rarity','Commun','pow',1,'aura',1,'tag','preserved'));
  end loop;
  alias_key:='cqa_band_alias_'||suffix;
  insert into public.kizuna_cards(id,source_id,card)
    select alias_key,source_id,jsonb_set(card,'{id}',to_jsonb(alias_key)) from public.kizuna_cards where id=card_ids[1];
  invalid_key:='cqa_band_invalid_'||suffix;
  insert into public.kizuna_cards(id,source_id,card) values(invalid_key,null,jsonb_build_object(
    'id',invalid_key,'name','Invalid source','series',label,'fav',999999,'image','https://s4.anilist.co/qa-invalid.jpg'));
  if (select count(*) from public.kizuna_cards where id=any(card_ids[1:5]) and card->>'rarity'='Mythique')<>5
    or (select count(*) from public.kizuna_cards where id=any(card_ids[6:10]) and card->>'rarity'='Légendaire')<>5
    or (select count(*) from public.kizuna_cards where id=any(card_ids[11:15]) and card->>'rarity'='Épique')<>5
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[16])<>'Rare'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[17])<>'Peu commune'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[18])<>'Commun'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[19])<>'Rare'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[20])<>'Peu commune'
    or (select card->>'rarity' from public.kizuna_cards where id=alias_key)<>'Mythique'
    or (select card->>'rarity' from public.kizuna_cards where id=invalid_key)<>'Rare' then
    raise exception 'Album bands, source deduplication, numeric ties or base rarities failed';
  end if;
  update public.kizuna_cards set card=jsonb_set(card,'{fav}','60000') where id=card_ids[18];
  if (select card->>'rarity' from public.kizuna_cards where id=card_ids[18])<>'Mythique'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[5])<>'Légendaire'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[10])<>'Épique'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[15])<>'Rare' then
    raise exception 'Favourite update did not automatically move all three band boundaries';
  end if;
  select jsonb_object_agg(id,card-array['rarity','pow','aura','rarity_policy']) into original
    from public.kizuna_cards where id=any(card_ids) or id in(alias_key,invalid_key);
  result:=public.kizuna_album_dispatch(actor,'create_album',jsonb_build_object('animeId',anime,'name',label));
  album_a:=(result#>>'{album,id}')::uuid;
  for card_key in select id from public.kizuna_cards where (id=any(card_ids) or id in(alias_key,invalid_key)) and id not in(card_ids[16],card_ids[17]) loop
    perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album_a,'cardId',card_key));
  end loop;
  if (select count(*) from public.kizuna_cards where id=any(card_ids) and card->>'rarity'='Mythique')<>2
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[1])<>'Rare'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[10])<>'Rare' then
    raise exception 'Managed album did not replace the original implicit popularity bands';
  end if;
  result:=public.kizuna_album_dispatch(actor,'create_album',jsonb_build_object('animeId',anime+1,'name','QA band B '||suffix,'cardIds',to_jsonb(card_ids[1:5])));
  album_b:=(result#>>'{album,id}')::uuid;
  perform public.kizuna_album_dispatch(actor,'add_album_card',jsonb_build_object('albumId',album_b,'cardId',card_ids[10]));
  perform public.kizuna_album_dispatch(actor,'add_album_card',jsonb_build_object('albumId',album_b,'cardId',card_ids[16]));
  result:=public.kizuna_album_dispatch(actor,'create_album',jsonb_build_object('animeId',anime+2,'name','QA band C '||suffix,'cardIds',to_jsonb(card_ids[1:5])));
  album_c:=(result#>>'{album,id}')::uuid;
  for i in 6..10 loop perform public.kizuna_album_dispatch(actor,'add_album_card',jsonb_build_object('albumId',album_c,'cardId',card_ids[i])); end loop;
  perform public.kizuna_album_dispatch(actor,'add_album_card',jsonb_build_object('albumId',album_c,'cardId',card_ids[18]));
  if (select card->>'rarity' from public.kizuna_cards where id=card_ids[16])<>'Mythique'
    or (select card->>'rarity' from public.kizuna_cards where id=card_ids[10])<>'Légendaire' then
    raise exception 'Global canonical priority Mythique > Legendaire > Epique failed';
  end if;
  perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album_b,'cardId',card_ids[10]));
  if (select card->>'rarity' from public.kizuna_cards where id=card_ids[10])<>'Épique' then raise exception 'Removing the legendary source did not preserve its epic rank elsewhere'; end if;
  perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album_c,'cardId',card_ids[10]));
  if (select card->>'rarity' from public.kizuna_cards where id=card_ids[10])<>'Rare' then raise exception 'Unranked favourite incorrectly kept an absolute legendary/epic tier'; end if;
  begin
    perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album_a,'cardId',card_ids[16]));
    raise exception 'An album was allowed below the existing two-character minimum';
  exception when check_violation then if sqlerrm<>'ALBUM_MINIMUM_CHARACTERS' then raise; end if; end;
  if exists(select 1 from public.kizuna_cards where private.kizuna_card_source(source_id,card)='53901' and card->>'rarity'<>'Mythique') then raise exception 'Madara exception was lost'; end if;
  select jsonb_object_agg(id,card-array['rarity','pow','aura','rarity_policy']) into current_values
    from public.kizuna_cards where id=any(card_ids) or id in(alias_key,invalid_key);
  if current_values is distinct from original then raise exception 'Ranking changed identity, images or other metadata'; end if;
  if exists(select 1 from public.kizuna_cards where (id=any(card_ids) or id in(alias_key,invalid_key)) and card->>'rarity_policy' is distinct from 'album-ranks-v2') then raise exception 'Policy marker missing'; end if;
  select md5(coalesce(string_agg(user_id::text||':'||snapshot::text||':'||revision::text,'|' order by user_id),'')) into state_after from public.kizuna_player_states;
  if state_before is distinct from state_after then raise exception 'Ranking changed owned cards, stock, currency or player revisions'; end if;
end;
$$;
set constraints all immediate;
select 'passed' as mythic_legendary_epic_bands,'passed' as deterministic_source_dedup,'passed' as favourite_rebalance,
  'passed' as global_priority,'passed' as managed_membership,'passed' as minimum_two,'passed' as metadata_and_player_preservation;
rollback;
