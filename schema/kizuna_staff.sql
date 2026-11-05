-- Staff permissions and rewards belong only to Kizuna. Existing administrator
-- memberships and all Yugen tables remain unchanged.
create table public.kizuna_moderators (
  user_id uuid primary key references public.kizuna_profiles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.kizuna_moderators enable row level security;
revoke all on public.kizuna_moderators from public,anon,authenticated,service_role;
grant select (user_id,created_at) on public.kizuna_moderators to authenticated;
create policy kizuna_moderators_select_own on public.kizuna_moderators
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.kizuna_boosters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 60),
  description text not null default '' check (char_length(description) <= 300),
  card_ids text[] not null default '{}' check (cardinality(card_ids) <= 500),
  card_count integer not null default 5 check (card_count = 5),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kizuna_boosters enable row level security;
revoke all on public.kizuna_boosters from public,anon,authenticated,service_role;
grant select on public.kizuna_boosters to anon,authenticated;
create policy kizuna_boosters_public_published on public.kizuna_boosters
  for select to anon,authenticated using (published);
create index kizuna_boosters_published_idx on public.kizuna_boosters(created_at,id) where published;

create table private.kizuna_account_reviews (
  user_id uuid primary key references public.kizuna_profiles(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table private.kizuna_staff_rewards (
  id uuid primary key,
  actor_id uuid references auth.users(id) on delete set null,
  user_id uuid not null references public.kizuna_profiles(id) on delete cascade,
  rolls integer not null check (rolls between 0 and 1000),
  chakra integer not null check (chakra between 0 and 1000000),
  reason text not null check (char_length(btrim(reason)) between 2 and 280),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint kizuna_rewards_positive check (rolls > 0 or chakra > 0)
);
create index kizuna_staff_rewards_pending_idx
  on private.kizuna_staff_rewards(user_id,created_at,id) where claimed_at is null;
create index kizuna_staff_rewards_actor_idx on private.kizuna_staff_rewards(actor_id);
create table private.kizuna_staff_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index kizuna_staff_audit_actor_idx on private.kizuna_staff_audit(actor_id,created_at);
alter table private.kizuna_account_reviews enable row level security;
alter table private.kizuna_staff_rewards enable row level security;
alter table private.kizuna_staff_audit enable row level security;
revoke all on private.kizuna_account_reviews,private.kizuna_staff_rewards,private.kizuna_staff_audit from public,anon,authenticated,service_role;
create policy kizuna_account_reviews_no_clients on private.kizuna_account_reviews for all to public using(false) with check(false);
create policy kizuna_staff_rewards_no_clients on private.kizuna_staff_rewards for all to public using(false) with check(false);
create policy kizuna_staff_audit_no_clients on private.kizuna_staff_audit for all to public using(false) with check(false);
create index kizuna_profiles_registration_idx on public.kizuna_profiles(created_at desc,id);

create function private.kizuna_staff_role(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when exists(select 1 from public.kizuna_admins where user_id=p_user_id) then 'admin'
    when exists(select 1 from public.kizuna_moderators where user_id=p_user_id) then 'moderator'
    else null end;
$$;

-- Only the Edge service can supply p_actor, after validating its bearer with
-- Auth.getUser. No browser can invoke this API with a forged actor UUID.
-- Every operation rechecks protected role rows inside its own transaction.
create function private.kizuna_staff_dispatch(p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text;
  v_target uuid;
  v_page integer;
  v_search text;
  v_players jsonb;
  v_has_next boolean;
  v_status text;
  v_note text;
  v_enabled boolean;
  v_booster jsonb;
  v_booster_id uuid;
  v_name text;
  v_description text;
  v_cards text[];
  v_published boolean;
  v_count integer;
  v_saved public.kizuna_boosters%rowtype;
  v_request uuid;
  v_rolls integer;
  v_chakra integer;
  v_reason text;
  v_reward private.kizuna_staff_rewards%rowtype;
  v_inserted boolean;
  v_state public.kizuna_player_states%rowtype;
  v_revision bigint;
  v_ids uuid[];
  v_claim_count integer;
  v_total_rolls bigint;
  v_total_chakra bigint;
  v_balance_rolls numeric;
  v_balance_chakra numeric;
  v_snapshot jsonb;
  v_stock jsonb;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor and is_anonymous=false) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'INVALID_INPUT' using errcode='22023';
  end if;
  v_role:=private.kizuna_staff_role(p_actor);
  if p_action='me' then return jsonb_build_object('role',v_role); end if;

  if p_action='claim_rewards' then
    if not exists(select 1 from public.kizuna_profiles where id=p_actor) then
      raise exception 'PROFILE_REQUIRED' using errcode='42501';
    end if;
    if coalesce(p_payload->>'expectedRevision','') !~ '^[0-9]{1,16}$'
      or (p_payload->>'expectedRevision')::numeric > 9007199254740991 then
      raise exception 'INVALID_INPUT' using errcode='22023';
    end if;
    v_revision:=(p_payload->>'expectedRevision')::bigint;
    -- Lock player state before pending rows. Concurrent claims serialize and a
    -- stale browser receives a conflict instead of overwriting unsaved cards.
    select * into v_state from public.kizuna_player_states where user_id=p_actor for update;
    if not found then raise exception 'STATE_REQUIRED' using errcode='42501'; end if;
    select array_agg(id),count(*),coalesce(sum(rolls),0),coalesce(sum(chakra),0)
    into v_ids,v_claim_count,v_total_rolls,v_total_chakra
    from (select id,rolls,chakra from private.kizuna_staff_rewards
      where user_id=p_actor and claimed_at is null order by created_at,id limit 100 for update) pending;
    if v_claim_count=0 then
      return jsonb_build_object('claimedCount',0,'rolls',0,'chakra',0,'snapshot',null,'revision',null);
    end if;
    if v_state.revision<>v_revision then raise exception 'STATE_CONFLICT' using errcode='40001'; end if;
    v_snapshot:=v_state.snapshot;
    v_stock:=case when jsonb_typeof(v_snapshot->'stock')='object' then v_snapshot->'stock' else '{}'::jsonb end;
    v_balance_chakra:=case when jsonb_typeof(v_snapshot->'chakra')='number' then (v_snapshot->>'chakra')::numeric else 0 end;
    v_balance_rolls:=case when jsonb_typeof(v_stock->'inv')='number' then (v_stock->>'inv')::numeric else 0 end;
    if v_balance_chakra<0 or v_balance_rolls<0
      or v_balance_chakra+v_total_chakra>1000000000
      or v_balance_rolls+v_total_rolls>1000000 then
      raise exception 'BALANCE_LIMIT' using errcode='22003';
    end if;
    v_stock:=jsonb_set(v_stock,'{inv}',to_jsonb(v_balance_rolls+v_total_rolls),true);
    v_snapshot:=jsonb_set(jsonb_set(v_snapshot,'{chakra}',to_jsonb(v_balance_chakra+v_total_chakra),true),'{stock}',v_stock,true);
    update public.kizuna_player_states set snapshot=v_snapshot,revision=revision+1,updated_at=now()
      where user_id=p_actor returning * into v_state;
    update private.kizuna_staff_rewards set claimed_at=now() where id=any(v_ids);
    return jsonb_build_object('claimedCount',v_claim_count,'rolls',v_total_rolls,'chakra',v_total_chakra,'snapshot',v_state.snapshot,'revision',v_state.revision);
  end if;

  if v_role is null then raise exception 'STAFF_REQUIRED' using errcode='42501'; end if;
  if p_action='list_players' then
    v_page:=coalesce((p_payload->>'page')::integer,1);
    v_search:=coalesce(p_payload->>'search','');
    if v_page not between 1 and 10000 or char_length(v_search)>100 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_players
    from (
      select p.id,p.username,p.created_at,u.last_sign_in_at,
        case when exists(select 1 from auth.identities i where i.user_id=p.id and i.provider='discord') then 'discord' else 'email' end as provider,
        case when r.reviewed_at is null then 'pending' else 'reviewed' end as review_status,
        coalesce(r.note,'') as review_note,r.reviewed_at,private.kizuna_staff_role(p.id) as staff_role
      from public.kizuna_profiles p join auth.users u on u.id=p.id
      left join private.kizuna_account_reviews r on r.user_id=p.id
      where v_search='' or position(lower(v_search) in lower(p.username))>0
      order by p.created_at desc,p.id offset ((v_page-1)*25) limit 26
    ) q;
    v_has_next:=jsonb_array_length(v_players)>25;
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_players
      from jsonb_array_elements(v_players) with ordinality e(value,n) where n<=25;
    return jsonb_build_object('players',v_players,'page',v_page,'hasNext',v_has_next);
  end if;
  if p_action='review_player' then
    v_target:=(p_payload->>'userId')::uuid;
    v_status:=p_payload->>'status';v_note:=coalesce(p_payload->>'note','');
    if v_target is null or v_status is null or v_status not in ('pending','reviewed') or char_length(v_note)>500 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    if not exists(select 1 from public.kizuna_profiles where id=v_target) then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
    insert into private.kizuna_account_reviews(user_id,note,reviewed_at,reviewed_by)
      values(v_target,v_note,case when v_status='reviewed' then now() else null end,case when v_status='reviewed' then p_actor else null end)
      on conflict(user_id) do update set note=excluded.note,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now();
    insert into private.kizuna_staff_audit(actor_id,action,target_id,details) values(p_actor,p_action,v_target,jsonb_build_object('status',v_status));
    return jsonb_build_object('ok',true);
  end if;
  if v_role<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_action='list_boosters' then
    return jsonb_build_object('boosters',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc,b.id) from public.kizuna_boosters b),'[]'::jsonb));
  end if;
  if p_action='save_booster' then
    v_booster:=p_payload->'booster';
    if jsonb_typeof(v_booster)<>'object' or v_booster is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    v_name:=btrim(v_booster->>'name');v_description:=coalesce(v_booster->>'description','');
    if v_name is null or char_length(v_name) not between 3 and 60 or char_length(v_description)>300
      or coalesce(jsonb_typeof(v_booster->'published'),'null')<>'boolean' or coalesce(jsonb_typeof(v_booster->'card_ids'),'null')<>'array'
      or jsonb_array_length(v_booster->'card_ids')>500 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    v_published:=(v_booster->>'published')::boolean;
    if exists(select 1 from jsonb_array_elements(v_booster->'card_ids') c where jsonb_typeof(c)<>'string' or char_length(c#>>'{}') not between 1 and 120) then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    select coalesce(array_agg(value),'{}'::text[]) into v_cards from jsonb_array_elements_text(v_booster->'card_ids');
    select count(distinct id) into v_count from public.kizuna_cards where id=any(v_cards);
    if v_count<>cardinality(v_cards) then raise exception 'INVALID_CARD_POOL' using errcode='22023'; end if;
    if v_published and (select count(distinct card->>'rarity') from public.kizuna_cards
      where id=any(v_cards) and card->>'rarity' in ('Rare','Épique','Légendaire','Mythique'))<>4 then
      raise exception 'MISSING_RARITIES' using errcode='22023';
    end if;
    if v_booster->>'id' is null then
      insert into public.kizuna_boosters(name,description,card_ids,published)
        values(v_name,v_description,v_cards,v_published) returning * into v_saved;
    else
      v_booster_id:=(v_booster->>'id')::uuid;
      update public.kizuna_boosters set name=v_name,description=v_description,card_ids=v_cards,published=v_published,updated_at=now()
        where id=v_booster_id returning * into v_saved;
      if not found then raise exception 'BOOSTER_NOT_FOUND' using errcode='P0002'; end if;
    end if;
    insert into private.kizuna_staff_audit(actor_id,action,target_id,details)
      values(p_actor,p_action,v_saved.id,jsonb_build_object('published',v_published,'cardCount',cardinality(v_cards)));
    return jsonb_build_object('booster',to_jsonb(v_saved));
  end if;
  if p_action='set_moderator' then
    v_target:=(p_payload->>'userId')::uuid;
    if v_target is null or coalesce(jsonb_typeof(p_payload->'enabled'),'null')<>'boolean' then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    v_enabled:=(p_payload->>'enabled')::boolean;
    if not exists(select 1 from public.kizuna_profiles where id=v_target) then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
    if private.kizuna_staff_role(v_target)='admin' then raise exception 'ADMIN_ROLE_PROTECTED' using errcode='42501'; end if;
    if v_enabled then
      insert into public.kizuna_moderators(user_id,granted_by) values(v_target,p_actor) on conflict(user_id) do nothing;
    else delete from public.kizuna_moderators where user_id=v_target; end if;
    insert into private.kizuna_staff_audit(actor_id,action,target_id,details) values(p_actor,p_action,v_target,jsonb_build_object('enabled',v_enabled));
    return jsonb_build_object('ok',true,'role',case when v_enabled then 'moderator' else null end);
  end if;
  if p_action='grant_rewards' then
    v_target:=(p_payload->>'userId')::uuid;v_request:=(p_payload->>'requestId')::uuid;
    v_rolls:=(p_payload->>'rolls')::integer;v_chakra:=(p_payload->>'chakra')::integer;v_reason:=btrim(p_payload->>'reason');
    if v_target is null or v_request is null or v_rolls is null or v_chakra is null
      or v_rolls not between 0 and 1000 or v_chakra not between 0 and 1000000
      or v_rolls+v_chakra=0 or v_reason is null or char_length(v_reason) not between 2 and 280 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
    if not exists(select 1 from public.kizuna_profiles where id=v_target) then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
    insert into private.kizuna_staff_rewards(id,actor_id,user_id,rolls,chakra,reason)
      values(v_request,p_actor,v_target,v_rolls,v_chakra,v_reason) on conflict(id) do nothing;
    v_inserted:=found;
    select * into v_reward from private.kizuna_staff_rewards where id=v_request;
    if v_reward.actor_id is distinct from p_actor or v_reward.user_id<>v_target or v_reward.rolls<>v_rolls
      or v_reward.chakra<>v_chakra or v_reward.reason<>v_reason then raise exception 'REQUEST_REUSED' using errcode='23505'; end if;
    if v_inserted then
      insert into private.kizuna_staff_audit(actor_id,action,target_id,details)
        values(p_actor,p_action,v_target,jsonb_build_object('requestId',v_request,'rolls',v_rolls,'chakra',v_chakra,'reason',v_reason));
    end if;
    return jsonb_build_object('reward',to_jsonb(v_reward)-'actor_id','duplicate',not v_inserted);
  end if;
  raise exception 'INVALID_ACTION' using errcode='22023';
end;
$$;

create function public.kizuna_staff_dispatch(p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.kizuna_staff_dispatch(p_actor,p_action,p_payload); $$;
revoke all on function private.kizuna_staff_role(uuid) from public,anon,authenticated,service_role;
revoke all on function private.kizuna_staff_dispatch(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.kizuna_staff_dispatch(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.kizuna_staff_dispatch(uuid,text,jsonb),public.kizuna_staff_dispatch(uuid,text,jsonb) to service_role;
