-- Keep the existing global event switch authoritative for new reward claims.
do $$declare definition text;begin
 definition:=pg_get_functiondef('kizuna_private.kizuna_anomalies(text,jsonb)'::regprocedure);
 if strpos(definition,E' if p_action=''claim'' then\n')=0 then raise exception 'FEATURE_GUARD_NOT_APPLICABLE';end if;
 execute replace(definition,E' if p_action=''claim'' then\n',E' if p_action=''claim'' then\n  if (select config#>>''{features,events}'' from public.kizuna_live_design where id)=''false'' then raise exception ''FEATURE_DISABLED'';end if;\n');
end; $$;
