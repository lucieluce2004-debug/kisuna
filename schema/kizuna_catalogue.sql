create table if not exists public.kizuna_cards (
  id text primary key,
  source_id bigint,
  card jsonb not null,
  created_at timestamptz not null default now(),
  constraint kizuna_card_object check (jsonb_typeof(card) = 'object' and card->>'id' = id)
);
-- Retained Kizuna editions can share an AniList character without sharing a card id.
create index if not exists kizuna_cards_source_id_idx on public.kizuna_cards(source_id);
alter table public.kizuna_cards enable row level security;
grant select on public.kizuna_cards to anon, authenticated;
revoke insert, update, delete on public.kizuna_cards from anon, authenticated;
create policy "Public card catalogue" on public.kizuna_cards for select to anon, authenticated using (true);
