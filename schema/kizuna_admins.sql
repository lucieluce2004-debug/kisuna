-- Only this app's administrators. Browser clients can inspect their own role,
-- but cannot insert, alter or delete administrator memberships.
create table if not exists public.kizuna_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.kizuna_admins enable row level security;
revoke all on public.kizuna_admins from public, anon, authenticated;
grant select on public.kizuna_admins to authenticated, service_role;
create policy kizuna_admins_select_own on public.kizuna_admins
  for select to authenticated using ((select auth.uid()) = user_id);

create schema if not exists private;
create table if not exists private.kizuna_admin_invites (
  email text primary key check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  created_at timestamptz not null default now()
);
alter table private.kizuna_admin_invites enable row level security;
revoke all on private.kizuna_admin_invites from public, anon, authenticated, service_role;

-- A narrowly scoped bootstrap is the only privileged operation: a caller can
-- claim ONLY their own membership, ONLY using an owner-issued invitation,
-- ONLY after Supabase Auth has confirmed their e-mail. No identity is accepted
-- as an argument and user-editable JWT metadata is never consulted.
create function private.claim_kizuna_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  verified_email text;
  claimed_email text;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if exists (select 1 from public.kizuna_admins where user_id = request_user_id) then
    return true;
  end if;
  select pg_catalog.lower(pg_catalog.btrim(u.email)) into verified_email
  from auth.users u
  where u.id = request_user_id and u.email_confirmed_at is not null;
  if verified_email is null then
    return false;
  end if;
  -- Consume invitations once, so later revocation cannot be undone by login.
  delete from private.kizuna_admin_invites
  where email = verified_email returning email into claimed_email;
  if claimed_email is null then
    return false;
  end if;
  insert into public.kizuna_admins(user_id) values (request_user_id)
  on conflict (user_id) do nothing;
  return true;
end;
$$;

create function public.claim_kizuna_admin()
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.claim_kizuna_admin(); $$;

revoke all on function private.claim_kizuna_admin() from public, anon, authenticated;
revoke all on function public.claim_kizuna_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.claim_kizuna_admin() to authenticated;
grant execute on function public.claim_kizuna_admin() to authenticated;
