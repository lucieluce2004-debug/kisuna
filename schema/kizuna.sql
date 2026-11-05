-- Kizuna account data. Authentication is owned by Supabase Auth.
-- No public profile directory: each account may only access its own rows.
create table if not exists public.kizuna_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Collectionneur' check (char_length(username) between 2 and 20),
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_card_id text check (avatar_card_id is null or char_length(avatar_card_id) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kizuna_player_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null default '{"owned":[],"pulls":[],"catalogue":[],"chakra":500,"username":"Collectionneur","stock":{}}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint player_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint player_snapshot_owned check (snapshot ? 'owned' and jsonb_typeof(snapshot->'owned') = 'array'),
  constraint player_snapshot_pulls check (snapshot ? 'pulls' and jsonb_typeof(snapshot->'pulls') = 'array'),
  constraint player_snapshot_size check (octet_length(snapshot::text) <= 8388608)
);

alter table public.kizuna_profiles enable row level security;
alter table public.kizuna_player_states enable row level security;

revoke all on public.kizuna_profiles from anon, authenticated, public;
revoke all on public.kizuna_player_states from anon, authenticated, public;
grant usage on schema public to authenticated;
grant select, insert, update on public.kizuna_profiles to authenticated;
grant select, insert, update on public.kizuna_player_states to authenticated;

create policy kizuna_profiles_select_own on public.kizuna_profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy kizuna_profiles_insert_own on public.kizuna_profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy kizuna_profiles_update_own on public.kizuna_profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy kizuna_player_states_select_own on public.kizuna_player_states for select to authenticated
  using ((select auth.uid()) = user_id);
create policy kizuna_player_states_insert_own on public.kizuna_player_states for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy kizuna_player_states_update_own on public.kizuna_player_states for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
