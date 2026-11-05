-- Additive repair after kizuna_nexus_lot_two.sql.
-- The economic dispatcher uses #variable_conflict use_variable and declares id text.
-- Qualify both injected configuration predicates; no data or reward is rewritten.
select pg_advisory_xact_lock(17493,700);
do $$declare d text;anchor text;replacement text;begin
 d:=pg_get_functiondef('kizuna_private.kizuna_economy(text,jsonb,uuid)'::regprocedure);
 anchor:='(select weekly_booster_id::text from kizuna_private.kizuna_nexus_config where id)';
 replacement:='(select cfg.weekly_booster_id::text from kizuna_private.kizuna_nexus_config cfg where cfg.id)';
 d:=kizuna_private.nexus_lot_two_patch_once(d,anchor,replacement);
 anchor:='(select weekly_booster_id from kizuna_private.kizuna_nexus_config where id and weekly_enabled)';
 replacement:='(select cfg.weekly_booster_id from kizuna_private.kizuna_nexus_config cfg where cfg.id and cfg.weekly_enabled)';
 d:=kizuna_private.nexus_lot_two_patch_once(d,anchor,replacement);
 execute d;
end; $$;
notify pgrst,'reload schema';
