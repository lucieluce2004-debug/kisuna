-- Login names are unique within Kizuna; Auth e-mails remain private.
alter table public.kizuna_profiles add constraint kizuna_username_ascii
  check (username ~ '^[A-Za-z0-9_.-]{2,20}$');
create unique index kizuna_profiles_username_ci
  on public.kizuna_profiles (lower(username));

create table private.kizuna_username_reservations (
  username_key text primary key check (username_key ~ '^[a-z0-9_.-]{2,20}$'),
  reservation_token uuid not null,
  user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
alter table private.kizuna_username_reservations enable row level security;
revoke all on private.kizuna_username_reservations from public, anon, authenticated, service_role;
create policy kizuna_reservations_deny_clients on private.kizuna_username_reservations
  for all to public using (false) with check (false);

-- Persistent signup cap complements the short Edge isolate/IP burst cap. No
-- address, password or e-mail is retained here; fingerprints are keyed hashes.
create table private.kizuna_signup_limits (
  fingerprint text primary key check (fingerprint ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table private.kizuna_signup_limits enable row level security;
revoke all on private.kizuna_signup_limits from public, anon, authenticated, service_role;
create policy kizuna_signup_limits_deny_clients on private.kizuna_signup_limits
  for all to public using (false) with check (false);

create function private.kizuna_take_signup_slot(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_attempts integer;
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into private.kizuna_signup_limits(fingerprint,window_start,attempts)
  values (p_fingerprint,now(),1)
  on conflict (fingerprint) do update set
    window_start = case when private.kizuna_signup_limits.window_start < now() - interval '1 hour' then now() else private.kizuna_signup_limits.window_start end,
    attempts = case when private.kizuna_signup_limits.window_start < now() - interval '1 hour' then 1 else least(private.kizuna_signup_limits.attempts + 1, 1000000) end
  returning attempts into current_attempts;
  -- Bounded expiry work; this table stores at most one recent row per source.
  delete from private.kizuna_signup_limits where fingerprint in (
    select fingerprint from private.kizuna_signup_limits
    where window_start < now() - interval '1 day' limit 100
  );
  return current_attempts <= 6;
end;
$$;

create function private.kizuna_reserve_username(p_username text, p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare requested_key text := pg_catalog.lower(p_username); reserved_key text;
begin
  if p_username !~ '^[A-Za-z0-9_.-]{2,20}$' or p_token is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_key, 17493));
  if exists (select 1 from public.kizuna_profiles where pg_catalog.lower(username)=requested_key) then return false; end if;
  insert into private.kizuna_username_reservations(username_key,reservation_token,expires_at)
  values (requested_key,p_token,now()+interval '10 minutes')
  on conflict (username_key) do update set
    reservation_token=excluded.reservation_token,user_id=null,expires_at=excluded.expires_at
  where private.kizuna_username_reservations.expires_at < now()
  returning username_key into reserved_key;
  return reserved_key is not null;
end;
$$;

-- Serialize username updates with pending signups, so a profile edit cannot
-- steal a name while the new Auth user is being created.
create function private.kizuna_guard_reserved_username()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reservation private.kizuna_username_reservations%rowtype;
begin
  if TG_OP='UPDATE' then
    if pg_catalog.lower(new.username)=pg_catalog.lower(old.username) then return new; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.lower(new.username),17493));
  select * into reservation from private.kizuna_username_reservations
  where username_key=pg_catalog.lower(new.username) and expires_at > now();
  if found and (reservation.user_id is null or reservation.user_id<>new.id) then
    raise exception 'Username unavailable' using errcode='23505';
  end if;
  return new;
end;
$$;
create trigger kizuna_username_reservation_guard
before insert or update of username on public.kizuna_profiles
for each row execute function private.kizuna_guard_reserved_username();

create function private.kizuna_finish_username(p_username text,p_token uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare requested_key text := pg_catalog.lower(p_username); reserved_key text;
begin
  if p_username !~ '^[A-Za-z0-9_.-]{2,20}$' or p_token is null or p_user_id is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_key,17493));
  update private.kizuna_username_reservations set user_id=p_user_id
  where username_key=requested_key and reservation_token=p_token and expires_at > now()
  returning username_key into reserved_key;
  if reserved_key is null then return false; end if;
  -- Insert only: never overwrite a profile belonging to an existing account.
  insert into public.kizuna_profiles(id,username) values (p_user_id,p_username);
  delete from private.kizuna_username_reservations
  where username_key=requested_key and reservation_token=p_token;
  return true;
end;
$$;

create function private.kizuna_release_username(p_username text,p_token uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.kizuna_username_reservations
  where username_key=pg_catalog.lower(p_username) and reservation_token=p_token;
$$;

-- Only the server service role can reach these narrow wrappers. Neither anon
-- nor signed-in browser clients can reserve names or inspect e-mail addresses.
create function public.kizuna_take_signup_slot(p_fingerprint text)
returns boolean language sql security invoker set search_path='' as $$ select private.kizuna_take_signup_slot(p_fingerprint); $$;
create function public.kizuna_reserve_username(p_username text,p_token uuid)
returns boolean language sql security invoker set search_path='' as $$ select private.kizuna_reserve_username(p_username,p_token); $$;
create function public.kizuna_finish_username(p_username text,p_token uuid,p_user_id uuid)
returns boolean language sql security invoker set search_path='' as $$ select private.kizuna_finish_username(p_username,p_token,p_user_id); $$;
create function public.kizuna_release_username(p_username text,p_token uuid)
returns void language sql security invoker set search_path='' as $$ select private.kizuna_release_username(p_username,p_token); $$;

revoke all on function private.kizuna_take_signup_slot(text) from public,anon,authenticated,service_role;
revoke all on function private.kizuna_reserve_username(text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.kizuna_guard_reserved_username() from public,anon,authenticated,service_role;
revoke all on function private.kizuna_finish_username(text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.kizuna_release_username(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.kizuna_take_signup_slot(text) from public,anon,authenticated,service_role;
revoke all on function public.kizuna_reserve_username(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.kizuna_finish_username(text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.kizuna_release_username(text,uuid) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.kizuna_take_signup_slot(text),private.kizuna_reserve_username(text,uuid),private.kizuna_finish_username(text,uuid,uuid),private.kizuna_release_username(text,uuid) to service_role;
grant execute on function public.kizuna_take_signup_slot(text),public.kizuna_reserve_username(text,uuid),public.kizuna_finish_username(text,uuid,uuid),public.kizuna_release_username(text,uuid) to service_role;
