-- Authoritative operations. No caller-supplied inventory, balance or draw result.
create table kizuna_private.kizuna_economy_archive (
 user_id uuid primary key references auth.users(id) on delete cascade,
 snapshot jsonb not null, revision bigint not null, captured_at timestamptz not null default now()
);
create table kizuna_private.kizuna_economy_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, action text not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(user_id,request_id)
);
create table kizuna_private.kizuna_market_listings (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.kizuna_profiles(id),
 card_id text not null references public.kizuna_cards(id), copy jsonb not null,
 mode text not null check(mode in ('sale','auction','trade')), price bigint not null check(price between 0 and 100000000),
 wants text[] not null default '{}', deposit bigint not null default 0,
 created_at timestamptz not null default now(), ends_at timestamptz,
 status text not null default 'active' check(status in ('active','cancelled','sold','traded','ended')),
 bidder_id uuid references public.kizuna_profiles(id), top_bid bigint not null default 0 check(top_bid between 0 and 100000000),
 buy_now bigint not null default 0, buyer_id uuid references public.kizuna_profiles(id), completed_at timestamptz
);
create index kizuna_market_active_date on kizuna_private.kizuna_market_listings(created_at desc,id) where status='active';
create index kizuna_market_seller on kizuna_private.kizuna_market_listings(seller_id,status);
create index kizuna_market_bidder on kizuna_private.kizuna_market_listings(bidder_id) where bidder_id is not null;
create index kizuna_market_buyer on kizuna_private.kizuna_market_listings(buyer_id) where buyer_id is not null;
create index kizuna_market_card on kizuna_private.kizuna_market_listings(card_id,completed_at desc);
create table kizuna_private.kizuna_economy_audit (
 id bigint generated always as identity primary key, user_id uuid not null references auth.users(id),
 action text not null, before_hash text not null, after_hash text not null, revision bigint not null,
 created_at timestamptz not null default now()
);
create index kizuna_economy_audit_user on kizuna_private.kizuna_economy_audit(user_id,created_at desc);
alter table kizuna_private.kizuna_economy_archive enable row level security;
alter table kizuna_private.kizuna_economy_receipts enable row level security;
alter table kizuna_private.kizuna_market_listings enable row level security;
alter table kizuna_private.kizuna_economy_audit enable row level security;
revoke all on kizuna_private.kizuna_economy_archive,kizuna_private.kizuna_economy_receipts,kizuna_private.kizuna_market_listings,kizuna_private.kizuna_economy_audit from public,anon,authenticated;

create function kizuna_private.econ_level(r text) returns integer language sql immutable security invoker set search_path='' as $$
 select array_position(array['Commun','Peu commune','Rare','Épique','Légendaire','Mythique'],r);
$$;
create function kizuna_private.econ_value(r text) returns integer language sql immutable security invoker set search_path='' as $$
 select (array[5,8,10,15,25,60])[kizuna_private.econ_level(r)];
$$;
create function kizuna_private.econ_random(n integer) returns integer language plpgsql volatile security invoker set search_path='' as $$
declare b bytea; x bigint; lim bigint;
begin
 if n<1 then raise exception 'EMPTY_POOL';end if;
 lim:=4294967296-(4294967296%n);
 loop
  b:=extensions.gen_random_bytes(4);
  x:=get_byte(b,0)::bigint*16777216+get_byte(b,1)::bigint*65536+get_byte(b,2)*256+get_byte(b,3);
  if x<lim then return (x%n)::integer;end if;
 end loop;
end; $$;
create function kizuna_private.econ_listing(l kizuna_private.kizuna_market_listings) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',l.id,'cardId',l.card_id,'sellerId',l.seller_id,'seller',s.username,'mode',l.mode,'price',l.price,
 'wantCardIds',l.wants,'wantCardId',l.wants[1],'status',l.status,'createdAt',floor(extract(epoch from l.created_at)*1000),
 'endsAt',floor(extract(epoch from l.ends_at)*1000),'topBid',l.top_bid,'bidder',coalesce(b.username,''),'bidderId',l.bidder_id,
 'depositFee',l.deposit,'buyNowPrice',l.buy_now,'reservedCopy',case when l.status='active' and l.seller_id=auth.uid() then l.copy else null end)
 from public.kizuna_profiles s left join public.kizuna_profiles b on b.id=l.bidder_id where s.id=l.seller_id;
$$;
create function kizuna_private.econ_write(u uuid,s jsonb,a text) returns void language plpgsql security invoker set search_path='' as $$
declare oldhash text; rev bigint; listings jsonb;
begin
 select coalesce(jsonb_agg(kizuna_private.econ_listing(l)||jsonb_build_object('reservedCopy',l.copy) order by l.created_at),'[]') into listings from kizuna_private.kizuna_market_listings l where seller_id=u and status='active';
 select jsonb_set(s,'{username}',to_jsonb(p.username)) into s from public.kizuna_profiles p where p.id=u;
 s:=jsonb_set(s,'{market}',coalesce(s->'market','{}')||jsonb_build_object('listings',listings));
 if (s->>'chakra')::numeric not between 0 and 1000000000 or (s#>>'{stock,inv}')::numeric not between 0 and 1000000 then raise exception 'BALANCE_LIMIT';end if;
 if jsonb_array_length(s->'owned')>5000 then raise exception 'INVENTORY_FULL';end if;
 select md5(snapshot::text) into oldhash from public.kizuna_player_states where user_id=u for update;
 update public.kizuna_player_states set snapshot=s,revision=revision+1,updated_at=now() where user_id=u returning revision into rev;
 insert into kizuna_private.kizuna_economy_audit(user_id,action,before_hash,after_hash,revision) values(u,a,oldhash,md5(s::text),rev);
end; $$;
create function kizuna_private.econ_deliver(u uuid,c jsonb,amount bigint,a text) returns void language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin
 select snapshot into strict s from public.kizuna_player_states where user_id=u for update;
 if c is not null then s:=jsonb_set(s,'{owned}',(s->'owned')||jsonb_build_array(c));end if;
 s:=jsonb_set(s,'{chakra}',to_jsonb((s->>'chakra')::bigint+amount));
 perform kizuna_private.econ_write(u,s,a);
end; $$;
create function kizuna_private.econ_settle() returns void language plpgsql security invoker set search_path='' as $$
declare l kizuna_private.kizuna_market_listings; fee bigint;
begin
 for l in select * from kizuna_private.kizuna_market_listings where status='active' and ends_at<=now() order by ends_at,id limit 100 for update loop
  if l.mode='auction' and l.bidder_id is not null then
   -- An inventory at its display limit must not lose an escrowed card. Defer until space is available.
   if (select jsonb_array_length(snapshot->'owned')>=5000 from public.kizuna_player_states where user_id=l.bidder_id) then continue;end if;
   fee:=greatest(1,ceil(l.top_bid*.05)::bigint);
   if (select (snapshot->>'chakra')::bigint+l.top_bid-fee>1000000000 from public.kizuna_player_states where user_id=l.seller_id) then continue;end if;
   update kizuna_private.kizuna_market_listings set status='sold',buyer_id=l.bidder_id,completed_at=now() where kizuna_private.kizuna_market_listings.id=l.id;
   perform kizuna_private.econ_deliver(l.bidder_id,l.copy,0,'auction_card');
   perform kizuna_private.econ_deliver(l.seller_id,null,l.top_bid-fee,'auction_sale');
  else
   if (select jsonb_array_length(snapshot->'owned')>=5000 from public.kizuna_player_states where user_id=l.seller_id) then continue;end if;
   update kizuna_private.kizuna_market_listings set status='ended',completed_at=now() where kizuna_private.kizuna_market_listings.id=l.id;
   perform kizuna_private.econ_deliver(l.seller_id,l.copy,0,'listing_expired');
  end if;
 end loop;
end; $$;
create function kizuna_private.econ_snapshot(u uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb; rev bigint; listings jsonb; history jsonb;
begin
 select snapshot,revision into strict s,rev from public.kizuna_player_states where user_id=u;
 select coalesce(jsonb_agg(kizuna_private.econ_listing(l) order by l.created_at),'[]') into listings from kizuna_private.kizuna_market_listings l where seller_id=u and status='active';
 select coalesce(jsonb_agg(x.data order by x.at desc),'[]') into history from (
  select l.completed_at at,jsonb_build_object('id',l.id,'type',case when l.mode='trade' then 'trade' when l.mode='auction' then 'auction' else 'buy' end,
   'cardId',l.card_id,'cardName',c.card->>'name','at',floor(extract(epoch from l.completed_at)*1000),'seller',p.username,'buyer',b.username,
   'gross',case when l.mode='auction' then l.top_bid else l.price end,
   'fee',case when l.mode='trade' then 0 else greatest(1,ceil((case when l.mode='auction' then l.top_bid else l.price end)*.05)::bigint) end)
  data from kizuna_private.kizuna_market_listings l join public.kizuna_cards c on c.id=l.card_id join public.kizuna_profiles p on p.id=l.seller_id left join public.kizuna_profiles b on b.id=l.buyer_id
  where l.status in ('sold','traded') and (l.seller_id=u or l.buyer_id=u) order by l.completed_at desc limit 80
 ) x;
 s:=jsonb_set(s,'{market}',coalesce(s->'market','{}')||jsonb_build_object('listings',listings,'history',history||(coalesce(s#>'{market,history}','[]'))));
 select jsonb_set(s,'{username}',to_jsonb(username)) into s from public.kizuna_profiles where id=u;
 return jsonb_build_object('snapshot',s,'revision',rev,'serverNow',floor(extract(epoch from now())*1000),'economyVersion',1);
end; $$;

create function kizuna_private.kizuna_economy(p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 u uuid:=auth.uid(); profile_name text; s jsonb; before_s jsonb; st jsonb; rec kizuna_private.kizuna_economy_receipts;
 result jsonb:='{}'; nowms bigint:=floor(extract(epoch from now())*1000); n integer; free_n integer; inv integer; elapsed integer;
 i integer; j integer; minlevel integer; tier integer; actual integer; choice integer; weights integer[]:=array[600,230,125,42,2,1];
 names text[]:=array['Commun','Peu commune','Rare','Épique','Légendaire','Mythique']; total integer; card jsonb; picked jsonb:='[]'; pack jsonb;
 pool jsonb; choices jsonb; selected text; custom_ids text[]; pm integer; pl integer; due_m boolean; due_l boolean;
 id text; idx integer; amount bigint; fee bigint; copy jsonb; newowned jsonb; keep jsonb; seen text[]:='{}'; day text; reward jsonb;
 l kizuna_private.kizuna_market_listings; target uuid; wants text[]; hours integer; mode text; page integer; rows jsonb; q text;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select p.username into profile_name from public.kizuna_profiles p where p.id=u;
 if not found then raise exception 'PROFILE_REQUIRED' using errcode='42501';end if;
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32000 then raise exception 'INVALID_INPUT';end if;
 -- One bounded economic transaction at a time avoids cross-account lock inversion.
 perform pg_advisory_xact_lock(17493,700);
 insert into public.kizuna_player_states(user_id,snapshot) values(u,jsonb_build_object('owned','[]'::jsonb,'pulls','[]'::jsonb,'catalogue','[]'::jsonb,'chakra',500,'username',profile_name,
  'stock',jsonb_build_object('free',3,'t',nowms,'inv',2,'pm',0,'pl',0,'day',''),'market',jsonb_build_object('listings','[]'::jsonb,'history','[]'::jsonb,'cards','[]'::jsonb,'credits','{}'::jsonb,'wishlist','[]'::jsonb))) on conflict do nothing;
 perform kizuna_private.econ_settle();
 select snapshot into strict s from public.kizuna_player_states where user_id=u for update;
 before_s:=s;
 s:=jsonb_set(s,'{username}',to_jsonb(profile_name));
 if p_action not in ('get','browse','history') then
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED';end if;
  select * into rec from kizuna_private.kizuna_economy_receipts where user_id=u and request_id=p_request_id;
  if found then
   if rec.action<>p_action or rec.payload<>p_payload then raise exception 'REQUEST_REUSED';end if;
   return kizuna_private.econ_snapshot(u)||jsonb_build_object('result',rec.result,'replayed',true);
  end if;
 end if;
 st:=s->'stock';
 free_n:=coalesce((st->>'free')::integer,3);inv:=coalesce((st->>'inv')::integer,2);
 if free_n>=100 then st:=st||jsonb_build_object('free',100,'t',nowms);
 else
  elapsed:=least(100,greatest(0,floor((nowms-coalesce((st->>'t')::bigint,nowms))/21600000.0)::integer));
  free_n:=least(100,free_n+elapsed);
  st:=st||jsonb_build_object('free',free_n,'t',case when free_n=100 then nowms else coalesce((st->>'t')::bigint,nowms)+elapsed::bigint*21600000 end);
 end if;
 s:=jsonb_set(s,'{stock}',st);
 if p_action='get' then null;
 elsif p_action='open' then
  n:=(p_payload->>'count')::integer;selected:=p_payload->>'booster';
  if n is null or n not in (1,5,10) then raise exception 'INVALID_QUANTITY';end if;
  if free_n+inv<n then raise exception 'INSUFFICIENT_PACKS';end if;
  if jsonb_array_length(s->'owned')+n*5>5000 then raise exception 'INVENTORY_FULL';end if;
  if selected like 'staff:%' then
   select b.card_ids into custom_ids from public.kizuna_boosters b where b.id::text=substr(selected,7) and published;
   if not found then raise exception 'BOOSTER_UNAVAILABLE';end if;
  elsif selected is null or selected not in ('mix','shonen','isekai','seinen','shojo','sport','mecha','waifus','husbandos') then raise exception 'BOOSTER_UNAVAILABLE';end if;
  select jsonb_agg(c.card||jsonb_build_object('id',c.id)) into pool from public.kizuna_cards c where custom_ids is null or c.id=any(custom_ids);
  if coalesce(jsonb_array_length(pool),0)=0 then raise exception 'EMPTY_POOL';end if;
  pm:=coalesce((st->>'pm')::integer,0);pl:=coalesce((st->>'pl')::integer,0);
  for i in 1..n loop
   pm:=pm+1;pl:=pl+1;due_m:=pm>=250;due_l:=pl>=50;pack:='[]';
   for j in 1..5 loop
    minlevel:=case when j=5 then 3 when j=4 then 2 else 1 end;
    total:=0;for tier in minlevel..6 loop total:=total+weights[tier];end loop;
    choice:=kizuna_private.econ_random(total);tier:=minlevel;
    while choice>=weights[tier] loop choice:=choice-weights[tier];tier:=tier+1;end loop;
    if j=5 and due_m then tier:=6;elsif j=5 and due_l then tier:=greatest(5,tier);end if;
    select coalesce(min(kizuna_private.econ_level(x->>'rarity')) filter(where kizuna_private.econ_level(x->>'rarity')>=tier),max(kizuna_private.econ_level(x->>'rarity'))) into actual from jsonb_array_elements(pool) x;
    select jsonb_agg(x) into choices from jsonb_array_elements(pool) x where kizuna_private.econ_level(x->>'rarity')=actual and
     (custom_ids is not null or selected='mix' or (selected='waifus' and x->>'g'='F') or (selected='husbandos' and x->>'g'='M') or coalesce(x->'cats','[]') ? selected);
    if choices is null then select jsonb_agg(x) into choices from jsonb_array_elements(pool) x where kizuna_private.econ_level(x->>'rarity')=actual;end if;
    card:=choices->kizuna_private.econ_random(jsonb_array_length(choices));
    copy:=jsonb_build_object('id',card->>'id','at',nowms,'rarity',names[actual],'level',actual);
    pack:=pack||jsonb_build_array(copy);s:=jsonb_set(s,'{owned}',(s->'owned')||jsonb_build_array(copy));
    if actual>=5 then s:=jsonb_set(s,'{pulls}',jsonb_build_array(copy||jsonb_build_object('name',card->>'name','series',card->>'series','username',profile_name,'pullId',gen_random_uuid()))||(s->'pulls'));end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(pack) x where (x->>'level')::integer=6) then pm:=0;end if;
   if exists(select 1 from jsonb_array_elements(pack) x where (x->>'level')::integer>=5) then pl:=0;end if;
   picked:=picked||pack;
  end loop;
  st:=st||jsonb_build_object('free',greatest(0,free_n-n),'inv',inv-greatest(0,n-free_n),'pm',pm,'pl',pl);
  s:=jsonb_set(s,'{stock}',st);select coalesce(jsonb_agg(x),'[]') into keep from (select value x from jsonb_array_elements(s->'pulls') with ordinality order by ordinality limit 30) z;
  s:=jsonb_set(s,'{pulls}',keep);result:=jsonb_build_object('cards',picked,'packs',n);
 elsif p_action='daily' then
  day:=to_char(now() at time zone 'UTC','YYYY-MM-DD');
  if st->>'day'=day or st->>'day'=to_char(now() at time zone 'UTC','Dy Mon DD YYYY') then raise exception 'DAILY_CLAIMED';end if;
  s:=jsonb_set(s,'{stock}',st||jsonb_build_object('inv',inv+3,'day',day));result:='{"rolls":3}';
 elsif p_action='shop' then
  n:=(p_payload->>'count')::integer;
  amount:=case n when 1 then 100 when 5 then 450 when 10 then 850 else null end;
  if amount is null then raise exception 'INVALID_QUANTITY';end if;
  if (s->>'chakra')::bigint<amount then raise exception 'INSUFFICIENT_CHAKRA';end if;
  s:=jsonb_set(jsonb_set(s,'{chakra}',to_jsonb((s->>'chakra')::bigint-amount)),'{stock}',st||jsonb_build_object('inv',inv+n));
 elsif p_action in ('recycle','recycle_all') then
  if (p_payload->>'revision')::bigint is distinct from (select revision from public.kizuna_player_states where user_id=u) then raise exception 'STATE_CONFLICT';end if;
  amount:=0;newowned:='[]';
  if p_action='recycle' then
   id:=p_payload->>'cardId';select max(ordinality)::integer-1 into idx from jsonb_array_elements(s->'owned') with ordinality where value->>'id'=id;
   if idx is null then raise exception 'CARD_UNAVAILABLE';end if;
   select kizuna_private.econ_value(c.card->>'rarity') into amount from public.kizuna_cards c where c.id=id;
   newowned:=(s->'owned')-idx;
  else
   for copy in select value from jsonb_array_elements(s->'owned') loop
    if copy->>'id'=any(seen) then
     select kizuna_private.econ_value(c.card->>'rarity') into n from public.kizuna_cards c where c.id=copy->>'id';
     if n is null then raise exception 'UNKNOWN_CARD';end if;amount:=amount+n;
    else seen:=array_append(seen,copy->>'id');newowned:=newowned||jsonb_build_array(copy);end if;
   end loop;
  end if;
  if amount is null then raise exception 'UNKNOWN_CARD';end if;
  s:=jsonb_set(jsonb_set(s,'{owned}',newowned),'{chakra}',to_jsonb((s->>'chakra')::bigint+amount));result:=jsonb_build_object('chakra',amount);
 elsif p_action='preferences' then
  select coalesce(jsonb_agg(to_jsonb(id)),'[]') into keep from (select distinct value#>>'{}' id from jsonb_array_elements(coalesce(p_payload->'wishlist','[]')) where exists(select 1 from public.kizuna_cards c where c.id=value#>>'{}') limit 5000) z;
  s:=jsonb_set(s,'{market}',coalesce(s->'market','{}')||jsonb_build_object('wishlist',keep));
 elsif p_action='claim_rewards' then
  perform kizuna_private.econ_write(u,s,'refresh_before_rewards');
  select revision into n from public.kizuna_player_states where user_id=u;
  reward:=private.kizuna_staff_dispatch(u,'claim_rewards',jsonb_build_object('expectedRevision',n));
  select snapshot into s from public.kizuna_player_states where user_id=u;before_s:=s;
  result:=jsonb_build_object('rolls',coalesce(reward->'rolls','0'),'chakra',coalesce(reward->'chakra','0'));
 elsif p_action='publish' then
  if (select count(*) from kizuna_private.kizuna_market_listings where seller_id=u and status='active')>=50 then raise exception 'LISTING_LIMIT';end if;
  id:=p_payload->>'cardId';mode:=p_payload->>'mode';hours:=(p_payload->>'hours')::integer;
  if mode is null or mode not in ('sale','auction','trade') or hours is null or hours not in (12,24,48) then raise exception 'INVALID_INPUT';end if;
  select max(ordinality)::integer-1 into idx from jsonb_array_elements(s->'owned') with ordinality where value->>'id'=id;
  if idx is null then raise exception 'CARD_UNAVAILABLE';end if;
  select kizuna_private.econ_value(c.card->>'rarity') into n from public.kizuna_cards c where c.id=id;
  if n is null then raise exception 'UNKNOWN_CARD';end if;
  amount:=coalesce((p_payload->>'price')::bigint,0);fee:=0;wants:='{}';
  if mode='trade' then
   select array_agg(distinct value) into wants from jsonb_array_elements_text(p_payload->'wants');
   if cardinality(wants) is null or cardinality(wants) not between 1 and 5 or id=any(wants) or exists(select 1 from unnest(wants) x where not exists(select 1 from public.kizuna_cards c where c.id=x)) then raise exception 'INVALID_WANTS';end if;amount:=0;
  else
   if amount not between n and 100000000 then raise exception 'INVALID_PRICE';end if;
   fee:=greatest(1,ceil(amount*.02)::bigint);
   if (s->>'chakra')::bigint<fee then raise exception 'INSUFFICIENT_CHAKRA';end if;
  end if;
  insert into kizuna_private.kizuna_market_listings(seller_id,card_id,copy,mode,price,wants,deposit,ends_at,buy_now)
   values(u,id,s->'owned'->idx,mode,amount,wants,fee,case when mode='trade' then null else now()+make_interval(hours=>hours) end,case when mode='auction' then least(100000000,amount+100) else 0 end) returning * into l;
  s:=jsonb_set(jsonb_set(s,'{owned}',(s->'owned')-idx),'{chakra}',to_jsonb((s->>'chakra')::bigint-fee));result:=jsonb_build_object('listingId',l.id);
 elsif p_action in ('cancel','buy','bid','trade') then
  select m.* into l from kizuna_private.kizuna_market_listings m where m.id=(p_payload->>'id')::uuid for update;
  if not found or l.status<>'active' or (l.ends_at is not null and l.ends_at<=now()) then raise exception 'LISTING_UNAVAILABLE';end if;
  if p_action='cancel' then
   if l.seller_id<>u then raise exception 'NOT_OWNER' using errcode='42501';end if;
   if l.bidder_id is not null then raise exception 'BID_EXISTS';end if;
   s:=jsonb_set(s,'{owned}',(s->'owned')||jsonb_build_array(l.copy));
   update kizuna_private.kizuna_market_listings set status='cancelled',completed_at=now() where kizuna_private.kizuna_market_listings.id=l.id;
  else
   if l.seller_id=u then raise exception 'SELF_TRADE';end if;
   if p_action='bid' then
    if l.mode<>'auction' then raise exception 'INVALID_MODE';end if;
    amount:=(p_payload->>'amount')::bigint;
    if amount is null or amount<greatest(l.price,l.top_bid+1) or amount>100000000 then raise exception 'INVALID_BID';end if;
    fee:=case when l.bidder_id=u then l.top_bid else 0 end;
    if (s->>'chakra')::bigint+fee<amount then raise exception 'INSUFFICIENT_CHAKRA';end if;
    if l.bidder_id is not null and l.bidder_id<>u then perform kizuna_private.econ_deliver(l.bidder_id,null,l.top_bid,'outbid_refund');end if;
    s:=jsonb_set(s,'{chakra}',to_jsonb((s->>'chakra')::bigint+fee-amount));
    update kizuna_private.kizuna_market_listings set bidder_id=u,top_bid=amount,ends_at=greatest(ends_at,now()+interval '2 minutes') where kizuna_private.kizuna_market_listings.id=l.id;
   elsif p_action='buy' then
    if l.mode not in ('sale','auction') then raise exception 'INVALID_MODE';end if;
    amount:=case when l.mode='auction' then l.buy_now else l.price end;
    fee:=case when l.bidder_id=u then l.top_bid else 0 end;
    if (s->>'chakra')::bigint+fee<amount then raise exception 'INSUFFICIENT_CHAKRA';end if;
    if l.bidder_id is not null and l.bidder_id<>u then perform kizuna_private.econ_deliver(l.bidder_id,null,l.top_bid,'buy_now_refund');end if;
    s:=jsonb_set(jsonb_set(s,'{chakra}',to_jsonb((s->>'chakra')::bigint+fee-amount)),'{owned}',(s->'owned')||jsonb_build_array(l.copy));
    update kizuna_private.kizuna_market_listings set status='sold',buyer_id=u,completed_at=now(),top_bid=case when l.mode='auction' then amount else l.top_bid end where kizuna_private.kizuna_market_listings.id=l.id;
    perform kizuna_private.econ_deliver(l.seller_id,null,amount-greatest(1,ceil(amount*.05)::bigint),'sale');
   else
    if l.mode<>'trade' then raise exception 'INVALID_MODE';end if;
    id:=p_payload->>'cardId';if not(id=any(l.wants)) then raise exception 'INVALID_WANTS';end if;
    select max(ordinality)::integer-1 into idx from jsonb_array_elements(s->'owned') with ordinality where value->>'id'=id;
    if idx is null then raise exception 'CARD_UNAVAILABLE';end if;
    copy:=s->'owned'->idx;s:=jsonb_set(s,'{owned}',((s->'owned')-idx)||jsonb_build_array(l.copy));
    update kizuna_private.kizuna_market_listings set status='traded',buyer_id=u,completed_at=now() where kizuna_private.kizuna_market_listings.id=l.id;
    perform kizuna_private.econ_deliver(l.seller_id,copy,0,'trade_card');
   end if;
  end if;
 elsif p_action='browse' then
  page:=coalesce((p_payload->>'page')::integer,0);q:=coalesce(p_payload->>'q','');mode:=coalesce(p_payload->>'mode','all');
  if page not between 0 and 10000 or length(q)>100 then raise exception 'INVALID_INPUT';end if;
  select coalesce(jsonb_agg(z.row order by z.dt desc,z.id),'[]') into rows from (
   select kizuna_private.econ_listing(m) row,m.created_at dt,m.id from kizuna_private.kizuna_market_listings m join public.kizuna_cards c on c.id=m.card_id
   where m.status='active' and (m.ends_at is null or m.ends_at>now()) and (mode='all' or m.mode=mode or (mode='mine' and m.seller_id=u))
    and (q='' or position(lower(q) in lower((c.card->>'name')||' '||(c.card->>'series')))>0)
   order by m.created_at desc,m.id offset page*24 limit 25
  ) z;result:=jsonb_build_object('listings',rows,'page',page);
 elsif p_action='history' then
  id:=p_payload->>'cardId';
  select coalesce(jsonb_agg(z.row order by z.at desc),'[]') into rows from (
   select jsonb_build_object('at',floor(extract(epoch from m.completed_at)*1000),'gross',case when m.mode='auction' then m.top_bid else m.price end) row,m.completed_at at
   from kizuna_private.kizuna_market_listings m where m.card_id=id and m.status='sold' and m.completed_at>=now()-interval '30 days' order by m.completed_at desc limit 1000
  ) z;result:=jsonb_build_object('sales',rows);
 else raise exception 'UNKNOWN_ACTION';end if;
 if s is distinct from before_s then perform kizuna_private.econ_write(u,s,p_action);end if;
 if p_action not in ('get','browse','history') then insert into kizuna_private.kizuna_economy_receipts(user_id,request_id,action,payload,result) values(u,p_request_id,p_action,p_payload,result);end if;
 return kizuna_private.econ_snapshot(u)||jsonb_build_object('result',result);
end; $$;
create function public.kizuna_economy(p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$
 select kizuna_private.kizuna_economy(p_action,p_payload,p_request_id);
$$;
revoke all on function kizuna_private.econ_level(text),kizuna_private.econ_value(text),kizuna_private.econ_random(integer),kizuna_private.econ_listing(kizuna_private.kizuna_market_listings),kizuna_private.econ_write(uuid,jsonb,text),kizuna_private.econ_deliver(uuid,jsonb,bigint,text),kizuna_private.econ_settle(),kizuna_private.econ_snapshot(uuid),kizuna_private.kizuna_economy(text,jsonb,uuid),public.kizuna_economy(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function kizuna_private.kizuna_economy(text,jsonb,uuid),public.kizuna_economy(text,jsonb,uuid) to authenticated;
-- Activation and immutable baseline capture are deliberately a separate, final migration.
