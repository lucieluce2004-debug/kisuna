-- Matches only real, newly published announcements against saved preferences.
create index kizuna_player_wishlist on public.kizuna_player_states using gin ((snapshot#>'{market,wishlist}'));
create function kizuna_private.market_wishlist_activity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform kizuna_private.market_notice(s.user_id,new,'wishlist','wishlist',jsonb_build_object('price',new.price))
 from public.kizuna_player_states s where s.user_id<>new.seller_id and (s.snapshot#>'{market,wishlist}') ? new.card_id;
 return new;
end; $$;
revoke all on function kizuna_private.market_wishlist_activity() from public,anon,authenticated;
create trigger kizuna_market_wishlist after insert on kizuna_private.kizuna_market_listings for each row execute function kizuna_private.market_wishlist_activity();

-- Keep expired escrow visible to its owner in My listings, without making it purchasable.
do $$
declare definition text; expected text:='m.status=''active'' and (m.ends_at is null or m.ends_at>now())';
begin
 select pg_get_functiondef('kizuna_private.kizuna_economy(text,jsonb,uuid)'::regprocedure) into definition;
 if strpos(definition,expected)=0 then raise exception 'Unexpected economy definition; inspect before editing';end if;
 execute replace(definition,expected,'m.status=''active'' and (mode=''mine'' or m.ends_at is null or m.ends_at>now())');
end; $$;
