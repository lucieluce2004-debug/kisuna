create index kizuna_market_notifications_listing on kizuna_private.kizuna_market_notifications(listing_id);
-- The RPC also declares an id variable: qualify the wishlist aggregation column.
do $$
declare definition text; expected text:='jsonb_agg(to_jsonb(id))';
begin
 select pg_get_functiondef('kizuna_private.kizuna_economy(text,jsonb,uuid)'::regprocedure) into definition;
 if strpos(definition,expected)=0 then raise exception 'Unexpected wishlist aggregation';end if;
 execute replace(definition,expected,'jsonb_agg(to_jsonb(z.id))');
end; $$;
