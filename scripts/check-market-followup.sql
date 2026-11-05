-- Privileged fixtures and all effects are rolled back. No messages leave the app.
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
 r jsonb; t jsonb; listing uuid; original jsonb; n bigint; previous_n bigint; highwater text; other_id text; bal bigint; i integer; blocked_id uuid; good_id uuid;
begin
 perform pg_advisory_xact_lock(17493,700);
 insert into auth.users(id,email,is_anonymous) values(a,'notice-a-'||suffix||'@example.invalid',false),(b,'notice-b-'||suffix||'@example.invalid',false),(c,'notice-c-'||suffix||'@example.invalid',false);
 insert into public.kizuna_profiles(id,username) values(a,'NoticeA_'||suffix),(b,'NoticeB_'||suffix),(c,'NoticeC_'||suffix);
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.kizuna_economy('get');
 perform set_config('request.jwt.claim.sub',c::text,true);perform public.kizuna_economy('get');
 r:=public.kizuna_economy('preferences','{"wishlist":["cseed-0013","cseed-0013","not-a-card",null]}',gen_random_uuid());
 if r#>'{snapshot,market,wishlist}'<>'["cseed-0013"]'::jsonb then raise exception 'Wishlist canonical IDs not saved';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);perform public.kizuna_economy('get');
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}','[{"id":"cseed-0013","at":1700000000000},{"id":"cseed-0014","at":1700000000001},{"id":"cseed-0015","at":1700000000002}]') where user_id=a;
 r:=public.kizuna_economy('publish','{"cardId":"cseed-0013","mode":"auction","hours":12,"price":100}',gen_random_uuid());listing:=(r#>>'{result,listingId}')::uuid;
 if not exists(select 1 from kizuna_private.kizuna_market_notifications where user_id=c and listing_id=listing and kind='wishlist') then raise exception 'Real wishlist match missing';end if;
 if exists(select 1 from kizuna_private.kizuna_market_notifications where user_id=b and listing_id=listing) then raise exception 'Unrelated player notified';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.kizuna_economy('bid',jsonb_build_object('id',listing,'amount',100),gen_random_uuid());
 perform set_config('request.jwt.claim.sub',c::text,true);perform public.kizuna_economy('bid',jsonb_build_object('id',listing,'amount',101),gen_random_uuid());
 perform set_config('request.jwt.claim.sub',b::text,true);r:=public.kizuna_market_inbox('get');
 if r#>>'{items,0,kind}'<>'outbid' or r#>>'{items,0,payload,amount}'<>'100' or (select snapshot->>'chakra' from public.kizuna_player_states where user_id=b)<>'500' then raise exception 'Outbid notice and actual refund disagree';end if;
 -- Buyout by a third party refunds the current bidder and only confirms committed sales.
 perform public.kizuna_economy('buy',jsonb_build_object('id',listing),gen_random_uuid());
 if not exists(select 1 from kizuna_private.kizuna_market_notifications where user_id=c and listing_id=listing and kind='refunded' and payload->>'amount'='101') then raise exception 'Buyout refund missing';end if;
 if not exists(select 1 from kizuna_private.kizuna_market_notifications where user_id=a and listing_id=listing and kind='sold' and payload->>'net'='190') then raise exception 'Seller net notice';end if;
 if (select count(*) from kizuna_private.kizuna_market_notifications where listing_id=listing and kind in ('sold','bought'))<>2 then raise exception 'Duplicated sale events';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 r:=public.kizuna_economy('publish','{"cardId":"cseed-0014","mode":"auction","hours":12,"price":100}',gen_random_uuid());listing:=(r#>>'{result,listingId}')::uuid;
 perform set_config('request.jwt.claim.sub',c::text,true);perform public.kizuna_economy('bid',jsonb_build_object('id',listing,'amount',100),gen_random_uuid());
 update kizuna_private.kizuna_market_listings set ends_at=now()-interval '1 minute' where id=listing;
 select snapshot into original from public.kizuna_player_states where user_id=c;
 perform set_config('request.jwt.claim.sub','',true);
 r:=kizuna_private.market_sweep();if r->>'processed'<>'1' then raise exception 'Unattended sweep failed';end if;
 if not exists(select 1 from public.kizuna_player_states,jsonb_array_elements(snapshot->'owned') x where user_id=c and x->>'at'='1700000000001') then raise exception 'Actual escrow copy not delivered';end if;
 select count(*) into n from kizuna_private.kizuna_market_notifications where user_id in(a,b,c);
 select (snapshot->>'chakra')::bigint into bal from public.kizuna_player_states where user_id=a;
 perform kizuna_private.market_sweep();
 if n<>(select count(*) from kizuna_private.kizuna_market_notifications where user_id in(a,b,c)) or bal<>(select (snapshot->>'chakra')::bigint from public.kizuna_player_states where user_id=a) then raise exception 'Sweep not idempotent';end if;
 -- One hundred blocked auctions cannot starve the next eligible announcement.
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',(select jsonb_agg(jsonb_build_object('id','cseed-0013','at',g.n)) from generate_series(1,5000) g(n))) where user_id=b;
 for i in 1..101 loop
  insert into kizuna_private.kizuna_market_listings(seller_id,card_id,copy,mode,price,ends_at,bidder_id,top_bid)
   values(a,'cseed-0013','{"id":"cseed-0013","at":1700000000010}','auction',100,now()-interval '1 hour',b,100) returning id into blocked_id;
 end loop;
 insert into kizuna_private.kizuna_market_listings(seller_id,card_id,copy,mode,price,ends_at)
 values(a,'cseed-0013','{"id":"cseed-0013","at":1700000000020}','sale',100,now()-interval '1 minute') returning id into good_id;
 perform kizuna_private.market_sweep();perform kizuna_private.market_sweep();
 if (select status from kizuna_private.kizuna_market_listings where id=good_id)<>'ended' or (select count(*) from kizuna_private.kizuna_market_listings where seller_id=a and settlement_issue='inventory_full')<>101 then raise exception 'Blocked queue starvation';end if;
 select count(*) into n from kizuna_private.kizuna_market_notifications where user_id=b and kind='pending';
 update kizuna_private.kizuna_market_listings set settle_after=now()-interval '1 minute' where id=blocked_id;
 perform kizuna_private.market_sweep();
 if n<>(select count(*) from kizuna_private.kizuna_market_notifications where user_id=b and kind='pending') then raise exception 'Retry notification spam';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}','[]') where user_id=b;
 update kizuna_private.kizuna_market_listings set settle_after=now()-interval '1 minute' where id=blocked_id;
 perform kizuna_private.market_sweep();
 if (select status from kizuna_private.kizuna_market_listings where id=blocked_id)<>'sold' then raise exception 'Retry after room freed failed';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);r:=public.kizuna_economy('browse','{"mode":"mine"}');
 if jsonb_array_length(r#>'{result,listings}')=0 or r#>>'{result,listings,0,reservedCopy,id}'<>'cseed-0013' then raise exception 'Pending escrow not visible to its owner';end if;
 -- Inbox is bound to the JWT actor; mark-all respects the observed high-water mark.
 perform set_config('request.jwt.claim.sub',a::text,true);r:=public.kizuna_market_inbox('get');highwater:=r->>'latestId';
 if jsonb_array_length(r->'items')<>26 then raise exception 'Pagination limit';end if;
 t:=public.kizuna_market_inbox('get',jsonb_build_object('before',r#>>'{items,24,id}'));
 if (t#>>'{items,0,id}')::bigint>=(r#>>'{items,24,id}')::bigint then raise exception 'Cursor overlap';end if;
 select id::text into other_id from kizuna_private.kizuna_market_notifications where user_id=b and read_at is null limit 1;
 select snapshot into original from public.kizuna_player_states where user_id=a;
 execute 'set local role authenticated';
 r:=public.kizuna_market_inbox('read',jsonb_build_object('id',other_id,'user_id',b));
 begin perform public.kizuna_market_inbox('health');raise exception 'Player read admin health';exception when insufficient_privilege then null;end;
 begin perform kizuna_private.market_sweep();raise exception 'Player ran scheduler';exception when insufficient_privilege then null;end;
 begin perform 1 from kizuna_private.kizuna_market_notifications;raise exception 'Notifications table exposed';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if (select read_at from kizuna_private.kizuna_market_notifications where id=other_id::bigint) is not null then raise exception 'Cross-account mark-read';end if;
 perform kizuna_private.market_notice(a,l,'pending','test_highwater') from kizuna_private.kizuna_market_listings l where id=good_id;
 execute 'set local role authenticated';r:=public.kizuna_market_inbox('read_all',jsonb_build_object('through',highwater));execute 'reset role';
 if r->>'unread'<>'1' then raise exception 'New event incorrectly marked read';end if;
 if original<>(select snapshot from public.kizuna_player_states where user_id=a) then raise exception 'Inbox changed economic state';end if;
 insert into public.kizuna_admins(user_id) values(a);
 execute 'set local role authenticated';r:=public.kizuna_market_inbox('health');execute 'reset role';
 if r->>'blocked'<>'100' then raise exception 'Admin health count';end if;
 update public.kizuna_admins set user_id=c where user_id=a;
 begin perform public.kizuna_market_inbox('health');raise exception 'Revoked admin still allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.kizuna_market_inbox('get');raise exception 'Guest allowed';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.kizuna_market_inbox(text,jsonb)','execute') then raise exception 'Anonymous execute exposed';end if;
end; $$;
rollback;
