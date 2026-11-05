-- Final cutover: preserve every original byte before closing browser writes.
-- No Auth, profile, Chakra, inventory, stock, rarity, pity or historical reset.
lock table public.kizuna_player_states in share row exclusive mode;
do $$
begin
 if exists(select 1 from public.kizuna_player_states s where
   exists(select 1 from jsonb_array_elements(coalesce(s.snapshot#>'{market,listings}','[]')) x where x->>'status'='active')
   or coalesce(s.snapshot#>'{market,credits}','{}')<>'{}'::jsonb
   or coalesce(s.snapshot#>'{market,cards}','[]')<>'[]'::jsonb) then
  raise exception 'LEGACY_ESCROW_REQUIRES_RECONCILIATION';
 end if;
 if exists(select 1 from public.kizuna_player_states s,jsonb_array_elements(s.snapshot->'owned') x where not exists(select 1 from public.kizuna_cards c where c.id=x->>'id')) then
  raise exception 'LEGACY_CARDS_REQUIRE_RECONCILIATION';
 end if;
end; $$;
insert into kizuna_private.kizuna_economy_archive(user_id,snapshot,revision)
 select user_id,snapshot,revision from public.kizuna_player_states on conflict do nothing;
revoke insert,update,delete on public.kizuna_player_states from authenticated,anon,public;
-- Owner-only SELECT and service-side staff grants remain as before.
