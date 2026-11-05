-- Read-only access checks. The original empty-album fixture is superseded by
-- check-album-mythics.sql and check-album-smoke.sql (minimum two characters).
-- No Auth user, profile, role or player-state writes are performed.
do $$
declare role_name text;table_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach table_name in array array['public.kizuna_albums','public.kizuna_album_cards'] loop
      if not has_table_privilege(role_name,table_name,'select')
        or has_table_privilege(role_name,table_name,'insert')
        or has_table_privilege(role_name,table_name,'update')
        or has_table_privilege(role_name,table_name,'delete') then raise exception 'Album table privileges failed for %',role_name; end if;
    end loop;
    if has_function_privilege(role_name,'public.kizuna_album_dispatch(uuid,text,jsonb)','execute')
      or has_function_privilege(role_name,'private.kizuna_album_value(uuid)','execute')
      or has_function_privilege(role_name,'public.kizuna_catalogue_series_size(text)','execute') then
      raise exception 'Browser can invoke a protected album helper';
    end if;
  end loop;
  if not has_function_privilege('service_role','public.kizuna_album_dispatch(uuid,text,jsonb)','execute') then raise exception 'Service album access is missing'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in('kizuna_albums','kizuna_album_cards') and not c.relrowsecurity) then raise exception 'Album RLS is disabled'; end if;
end;
$$;
select 'passed' as public_read_only,'passed' as service_only_rpc,'passed' as album_rls;
