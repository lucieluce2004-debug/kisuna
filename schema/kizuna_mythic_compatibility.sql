-- Keep existing cosmetic missions and sanctuary prerequisites aware of Mythic unlocks.
create function kizuna_private.mythic_sync_adventure(u uuid) returns void language plpgsql security invoker set search_path='' as $$
declare levels jsonb;
begin
 select coalesce(jsonb_object_agg(p.card_id,least(p.unlocked,2)),'{}') into levels from kizuna_private.kizuna_mythic_progress p join public.kizuna_cards c on c.id=p.card_id where p.user_id=u and p.unlocked>0 and c.card->>'rarity'='Mythique';
 if levels='{}'::jsonb then return;end if;
 insert into kizuna_private.kizuna_adventure_players(user_id) values(u) on conflict do nothing;
 update kizuna_private.kizuna_adventure_players set state=jsonb_set(state,'{awakened}',(state->'awakened')||levels),revision=revision+1,updated_at=now()
 where user_id=u and (state->'awakened') is distinct from (state->'awakened')||levels;
end; $$;
revoke all on function kizuna_private.mythic_sync_adventure(uuid) from public,anon,authenticated;
do $$declare definition text;begin
 definition:=pg_get_functiondef('kizuna_private.mythic_record_open(uuid,uuid,jsonb,jsonb,integer)'::regprocedure);
 if strpos(definition,' return awards;')=0 then raise exception 'OPEN_COMPATIBILITY_ANCHOR';end if;
 execute replace(definition,' return awards;',E' perform kizuna_private.mythic_sync_adventure(u);\n return awards;');
 definition:=pg_get_functiondef('kizuna_private.kizuna_mythic(text,jsonb)'::regprocedure);
 if strpos(definition,' perform kizuna_private.mythic_reconcile(u);')=0 then raise exception 'RECONCILE_COMPATIBILITY_ANCHOR';end if;
 execute replace(definition,' perform kizuna_private.mythic_reconcile(u);',E' perform kizuna_private.mythic_reconcile(u);\n perform kizuna_private.mythic_sync_adventure(u);');
end; $$;
