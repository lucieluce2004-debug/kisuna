-- Avoid shadowing the published-row enabled column in the privileged RPC.
do $$declare definition text;begin
 definition:=pg_get_functiondef('kizuna_private.kizuna_anomalies(text,jsonb)'::regprocedure);
 if strpos(definition,'page integer;enabled boolean;')=0 then raise exception 'ANOMALY_VALIDATION_ANCHOR';end if;
 execute replace(definition,'page integer;enabled boolean;','page integer;');
end; $$;
