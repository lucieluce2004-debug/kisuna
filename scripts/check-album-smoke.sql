-- Album metadata only: no Auth/profile/role/state writes. Everything rolls back.
begin;
do $$
declare actor uuid;album uuid;anime integer;card_ids text[];original jsonb;result jsonb;again jsonb;
begin
  select a.user_id into actor from public.kizuna_admins a join public.kizuna_profiles p on p.id=a.user_id order by a.created_at limit 1;
  if actor is null then raise exception 'An existing administrator is required'; end if;
  anime:=(1000000000+floor(random()*1000000000))::integer;
  while exists(select 1 from public.kizuna_albums where anime_id=anime) loop anime:=anime+1; end loop;
  select array_agg(id) into card_ids from (
    select distinct on(private.kizuna_card_source(source_id,card)) id
    from public.kizuna_cards where private.kizuna_card_source(source_id,card) is not null
    order by private.kizuna_card_source(source_id,card),id limit 3
  ) cards;
  if cardinality(card_ids)<>3 then raise exception 'Three distinct catalogue characters are required'; end if;
  select jsonb_object_agg(id,card-array['rarity','pow','aura','rarity_policy']) into original from public.kizuna_cards where id=any(card_ids);
  result:=public.kizuna_album_dispatch(actor,'create_album',jsonb_build_object('animeId',anime,'name','QA transient album '||gen_random_uuid()::text,'cardIds',to_jsonb(card_ids[1:2])));
  album:=(result#>>'{album,id}')::uuid;
  if jsonb_array_length(result#>'{album,card_ids}')<>2 then raise exception 'Album minimum was not seeded'; end if;
  again:=public.kizuna_album_dispatch(actor,'create_album',jsonb_build_object('animeId',anime,'name','Ignored retry name'));
  if again is distinct from result then raise exception 'Creation is not idempotent'; end if;
  result:=public.kizuna_album_dispatch(actor,'add_album_card',jsonb_build_object('albumId',album,'cardId',card_ids[3]));
  again:=public.kizuna_album_dispatch(actor,'add_album_card',jsonb_build_object('albumId',album,'cardId',card_ids[3]));
  if jsonb_array_length(result#>'{album,card_ids}')<>3 or result is distinct from again then raise exception 'Membership is not idempotent'; end if;
  result:=public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album,'cardId',card_ids[3]));
  if jsonb_array_length(result#>'{album,card_ids}')<>2 then raise exception 'Third membership was not removed'; end if;
  begin
    perform public.kizuna_album_dispatch(actor,'remove_album_card',jsonb_build_object('albumId',album,'cardId',card_ids[1]));
    raise exception 'Removal below the two-character minimum was accepted';
  exception when check_violation then if sqlerrm<>'ALBUM_MINIMUM_CHARACTERS' then raise; end if; end;
  if (select jsonb_object_agg(id,card-array['rarity','pow','aura','rarity_policy']) from public.kizuna_cards where id=any(card_ids)) is distinct from original then
    raise exception 'Ranking changed canonical identity or other card metadata';
  end if;
end;
$$;
set constraints all immediate;
select 'passed' as album_create_and_retry,'passed' as membership_add_remove,'passed' as minimum_two,'passed' as canonical_identity_preserved;
rollback;
