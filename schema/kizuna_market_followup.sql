-- Private activity and unattended settlement. Existing inventories remain intact.
alter table kizuna_private.kizuna_market_listings
 add column settle_after timestamptz,
 add column last_settlement_attempt timestamptz,
 add column settlement_issue text check(settlement_issue in ('inventory_full','balance_limit','retry_error')),
 add column settlement_error text;
create index kizuna_market_due on kizuna_private.kizuna_market_listings(ends_at,settle_after)
 where status='active' and ends_at is not null;
create table kizuna_private.kizuna_market_notifications (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.kizuna_profiles(id),
 listing_id uuid not null references kizuna_private.kizuna_market_listings(id),
 event_key text not null, kind text not null, payload jsonb not null,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(user_id,event_key)
);
create index kizuna_market_notifications_owner on kizuna_private.kizuna_market_notifications(user_id,id desc);
create index kizuna_market_notifications_unread on kizuna_private.kizuna_market_notifications(user_id,id) where read_at is null;
create table kizuna_private.kizuna_market_scheduler (
 singleton boolean primary key default true check(singleton),
 started_at timestamptz, finished_at timestamptz, last_success_at timestamptz,
 status text not null default 'waiting', processed integer not null default 0, error_code text
);
insert into kizuna_private.kizuna_market_scheduler(singleton) values(true);
alter table kizuna_private.kizuna_market_notifications enable row level security;
alter table kizuna_private.kizuna_market_scheduler enable row level security;
revoke all on kizuna_private.kizuna_market_notifications,kizuna_private.kizuna_market_scheduler from public,anon,authenticated;

create function kizuna_private.market_notice(u uuid,l kizuna_private.kizuna_market_listings,k text,event_suffix text,extra jsonb default '{}')
returns void language sql security invoker set search_path='' as $$
 insert into kizuna_private.kizuna_market_notifications(user_id,listing_id,event_key,kind,payload)
 select u,l.id,l.id::text||':'||event_suffix,k,
 jsonb_build_object('cardId',l.card_id,'cardName',c.card->>'name','mode',l.mode)||extra
 from public.kizuna_cards c where c.id=l.card_id and u is not null
 on conflict(user_id,event_key) do nothing;
$$;
create function kizuna_private.market_activity() returns trigger language plpgsql security invoker set search_path='' as $$
declare gross bigint; fee bigint; recipient uuid;
begin
 if tg_op='INSERT' then
  perform kizuna_private.market_notice(new.seller_id,new,'published','published',jsonb_build_object('deposit',new.deposit));
 elsif new.status<>old.status then
  if new.status='sold' then
   gross:=case when new.mode='auction' then new.top_bid else new.price end;
   fee:=greatest(1,ceil(gross*.05)::bigint);
   perform kizuna_private.market_notice(new.seller_id,new,'sold','sold',jsonb_build_object('gross',gross,'fee',fee,'net',gross-fee));
   perform kizuna_private.market_notice(new.buyer_id,new,'bought','bought',jsonb_build_object('amount',gross));
   if old.bidder_id is not null and old.bidder_id<>new.buyer_id then
    perform kizuna_private.market_notice(old.bidder_id,new,'refunded','buyout_refund',jsonb_build_object('amount',old.top_bid));
   end if;
  elsif new.status='traded' then
   perform kizuna_private.market_notice(new.seller_id,new,'traded','traded');
   perform kizuna_private.market_notice(new.buyer_id,new,'traded','traded');
  elsif new.status in ('ended','cancelled') then
   perform kizuna_private.market_notice(new.seller_id,new,new.status,new.status);
  end if;
 elsif new.status='active' and new.top_bid>old.top_bid then
  perform kizuna_private.market_notice(new.seller_id,new,'new_bid','new_bid:'||new.top_bid,jsonb_build_object('amount',new.top_bid));
  perform kizuna_private.market_notice(new.bidder_id,new,'bid_placed','bid_placed:'||new.top_bid,jsonb_build_object('amount',new.top_bid));
  if old.bidder_id is not null and old.bidder_id<>new.bidder_id then
   perform kizuna_private.market_notice(old.bidder_id,new,'outbid','outbid:'||new.top_bid,jsonb_build_object('amount',old.top_bid));
  end if;
 elsif new.status='active' and new.settlement_issue is not null and new.settlement_issue is distinct from old.settlement_issue then
  recipient:=case when new.settlement_issue='inventory_full' and new.mode='auction' and new.bidder_id is not null then new.bidder_id else new.seller_id end;
  perform kizuna_private.market_notice(recipient,new,'pending','pending:'||new.settlement_issue,jsonb_build_object('reason',new.settlement_issue));
 end if;
 return new;
end; $$;
create trigger kizuna_market_activity after insert or update on kizuna_private.kizuna_market_listings for each row execute function kizuna_private.market_activity();

create or replace function kizuna_private.econ_settle() returns void language plpgsql security invoker set search_path='' as $$
declare l kizuna_private.kizuna_market_listings; fee bigint; issue text; error_state text;
begin
 -- All paths use the same lock order, including calls outside player RPCs.
 perform pg_advisory_xact_lock(17493,700);
 for l in select * from kizuna_private.kizuna_market_listings
  where status='active' and ends_at<=now() and (settle_after is null or settle_after<=now())
  order by coalesce(last_settlement_attempt,ends_at),ends_at,id limit 100 for update loop
  begin
   issue:=null;
   -- Lock both snapshots before checking capacity; staff grants also lock these rows.
   perform 1 from public.kizuna_player_states where user_id in (l.seller_id,l.bidder_id) order by user_id for update;
   if l.mode='auction' and l.bidder_id is not null then
    fee:=greatest(1,ceil(l.top_bid*.05)::bigint);
    if (select jsonb_array_length(snapshot->'owned')>=5000 from public.kizuna_player_states where user_id=l.bidder_id) then issue:='inventory_full';
    elsif (select (snapshot->>'chakra')::bigint+l.top_bid-fee>1000000000 from public.kizuna_player_states where user_id=l.seller_id) then issue:='balance_limit';end if;
    if issue is null then
     update kizuna_private.kizuna_market_listings set status='sold',buyer_id=l.bidder_id,completed_at=now(),settlement_issue=null,settlement_error=null,settle_after=null,last_settlement_attempt=now() where id=l.id;
     perform kizuna_private.econ_deliver(l.bidder_id,l.copy,0,'auction_card');
     perform kizuna_private.econ_deliver(l.seller_id,null,l.top_bid-fee,'auction_sale');
    end if;
   else
    if (select jsonb_array_length(snapshot->'owned')>=5000 from public.kizuna_player_states where user_id=l.seller_id) then issue:='inventory_full';end if;
    if issue is null then
     update kizuna_private.kizuna_market_listings set status='ended',completed_at=now(),settlement_issue=null,settlement_error=null,settle_after=null,last_settlement_attempt=now() where id=l.id;
     perform kizuna_private.econ_deliver(l.seller_id,l.copy,0,'listing_expired');
    end if;
   end if;
   if issue is not null then
    update kizuna_private.kizuna_market_listings set settlement_issue=issue,settlement_error=null,last_settlement_attempt=now(),settle_after=now()+interval '1 minute' where id=l.id;
   end if;
  exception when others then
   get stacked diagnostics error_state=returned_sqlstate;
   -- This subtransaction rolls back delivery and its notifications together.
   update kizuna_private.kizuna_market_listings set settlement_issue='retry_error',settlement_error=error_state,last_settlement_attempt=now(),settle_after=now()+interval '5 minutes' where id=l.id;
  end;
 end loop;
end; $$;

create function kizuna_private.market_sweep() returns jsonb language plpgsql security invoker set search_path='' as $$
declare before_n integer; after_n integer; code text;
begin
 if not pg_try_advisory_xact_lock(17493,700) then
  update kizuna_private.kizuna_market_scheduler set started_at=clock_timestamp(),finished_at=clock_timestamp(),status='busy',processed=0,error_code=null where singleton;
  return jsonb_build_object('status','busy');
 end if;
 update kizuna_private.kizuna_market_scheduler set started_at=clock_timestamp(),status='running',error_code=null where singleton;
 begin
  select count(*) into before_n from kizuna_private.kizuna_market_listings where status='active' and ends_at<=now();
  perform kizuna_private.econ_settle();
  select count(*) into after_n from kizuna_private.kizuna_market_listings where status='active' and ends_at<=now();
  update kizuna_private.kizuna_market_scheduler set finished_at=clock_timestamp(),last_success_at=clock_timestamp(),status='ok',processed=before_n-after_n where singleton;
  return jsonb_build_object('status','ok','processed',before_n-after_n);
 exception when others then
  get stacked diagnostics code=returned_sqlstate;
  update kizuna_private.kizuna_market_scheduler set finished_at=clock_timestamp(),status='error',processed=0,error_code=code where singleton;
  return jsonb_build_object('status','error');
 end;
end; $$;

create function kizuna_private.kizuna_market_inbox(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); cursor_id bigint; through_id bigint; items jsonb; unread_n bigint; latest_id bigint;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.kizuna_profiles where id=u) then raise exception 'PROFILE_REQUIRED' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2048 then raise exception 'INVALID_INPUT';end if;
 if p_action='health' then
  if not exists(select 1 from public.kizuna_admins where user_id=u) then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
  return jsonb_build_object('scheduler',(select to_jsonb(s)-'singleton' from kizuna_private.kizuna_market_scheduler s where singleton),
   'scheduled',exists(select 1 from cron.job where jobname='kizuna-market-settlement' and active),
   'due',(select count(*) from kizuna_private.kizuna_market_listings where status='active' and ends_at<=now()),
   'blocked',(select count(*) from kizuna_private.kizuna_market_listings where status='active' and settlement_issue is not null),
   'issues',(select coalesce(jsonb_object_agg(reason,n),'{}') from (select settlement_issue reason,count(*) n from kizuna_private.kizuna_market_listings where status='active' and settlement_issue is not null group by settlement_issue) x));
 elsif p_action='read' then
  if coalesce(p_payload->>'id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'INVALID_INPUT';end if;
  update kizuna_private.kizuna_market_notifications set read_at=now() where user_id=u and id=(p_payload->>'id')::bigint and read_at is null;
 elsif p_action='read_all' then
  if coalesce(p_payload->>'through','') !~ '^[0-9]{1,19}$' then raise exception 'INVALID_INPUT';end if;
  through_id:=(p_payload->>'through')::bigint;
  update kizuna_private.kizuna_market_notifications set read_at=now() where user_id=u and id<=through_id and read_at is null;
 elsif p_action not in ('get','count') then raise exception 'INVALID_ACTION';end if;
 select count(*) into unread_n from kizuna_private.kizuna_market_notifications where user_id=u and read_at is null;
 select coalesce(max(id),0) into latest_id from kizuna_private.kizuna_market_notifications where user_id=u;
 if p_action='count' then return jsonb_build_object('unread',unread_n,'latestId',latest_id::text);end if;
 if p_payload ? 'before' then
  if coalesce(p_payload->>'before','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'INVALID_INPUT';end if;
  cursor_id:=(p_payload->>'before')::bigint;
 end if;
 select coalesce(jsonb_agg(x.data order by x.id desc),'[]') into items from (
  select id,jsonb_build_object('id',id::text,'listingId',listing_id,'kind',kind,'payload',payload,'createdAt',created_at,'readAt',read_at) data
  from kizuna_private.kizuna_market_notifications where user_id=u and (cursor_id is null or id<cursor_id)
   and (coalesce(p_payload->>'filter','all')<>'unread' or read_at is null) order by id desc limit 26
 ) x;
 return jsonb_build_object('items',items,'unread',unread_n,'latestId',latest_id::text);
end; $$;
create function public.kizuna_market_inbox(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select kizuna_private.kizuna_market_inbox(p_action,p_payload);$$;
revoke all on function kizuna_private.market_notice(uuid,kizuna_private.kizuna_market_listings,text,text,jsonb),kizuna_private.market_activity(),kizuna_private.market_sweep(),kizuna_private.kizuna_market_inbox(text,jsonb),public.kizuna_market_inbox(text,jsonb) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_market_inbox(text,jsonb),public.kizuna_market_inbox(text,jsonb) to authenticated;
revoke all on sequence kizuna_private.kizuna_market_notifications_id_seq from public,anon,authenticated;

-- Native SQL scheduling needs no API key, OAuth token or external HTTP call.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
