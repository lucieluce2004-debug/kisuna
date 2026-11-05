create or replace function kizuna_private.econ_write(u uuid,s jsonb,a text) returns void language plpgsql security invoker set search_path='' as $$
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
