-- Required integration checks for the explicitly requested role-management
-- feature. One temporary Auth/profile fixture; all rows/role changes roll back.
begin;
do $$
declare
  administrator uuid;
  fixture uuid:=gen_random_uuid();
  missing_user uuid:=gen_random_uuid();
  suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
  fixture_email text;
  result jsonb;
  administrator_count bigint;
begin
  select a.user_id into administrator from public.kizuna_admins a
    join public.kizuna_profiles p on p.id=a.user_id order by a.created_at,a.user_id limit 1;
  if administrator is null then raise exception 'An existing Kizuna administrator is required'; end if;
  select count(*) into administrator_count from public.kizuna_admins;
  fixture_email:='qa-role-'||suffix||'@example.invalid';
  insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
    values(fixture,fixture_email,false,'{"role":"admin","isAdmin":true}'::jsonb);
  insert into public.kizuna_profiles(id,username) values(fixture,'QARole_'||suffix);
  if has_function_privilege('anon','public.kizuna_set_staff_role(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.kizuna_set_staff_role(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','private.kizuna_set_staff_role(uuid,uuid,text)','execute')
    or not has_function_privilege('service_role','public.kizuna_set_staff_role(uuid,uuid,text)','execute') then
    raise exception 'Role RPC must be service-only';
  end if;
  -- Editable metadata never grants the acting administrator permission.
  begin
    perform public.kizuna_set_staff_role(fixture,fixture,'admin');
    raise exception 'Player self-promoted using metadata';
  exception when insufficient_privilege then if sqlerrm<>'ADMIN_REQUIRED' then raise; end if; end;
  begin
    perform public.kizuna_set_staff_role(null,fixture,'admin');raise exception 'Anonymous actor was accepted';
  exception when invalid_authorization_specification then if sqlerrm<>'AUTH_REQUIRED' then raise; end if; end;
  begin
    perform public.kizuna_set_staff_role(administrator,missing_user,'admin');raise exception 'Non-Kizuna target was accepted';
  exception when no_data_found then if sqlerrm<>'PLAYER_NOT_FOUND' then raise; end if; end;
  begin
    perform public.kizuna_set_staff_role(administrator,fixture,'owner');raise exception 'Unrequested third staff role was accepted';
  exception when invalid_parameter_value then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',fixture::text,true);
  execute 'set local role anon';
  begin
    perform public.kizuna_set_staff_role(administrator,fixture,'admin');raise exception 'Anonymous browser supplied a forged actor';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role authenticated';
  begin
    perform public.kizuna_set_staff_role(administrator,fixture,'admin');raise exception 'Authenticated browser supplied a forged actor';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  -- Owner self-assignment is idempotent. Both self-demotion targets are denied
  -- and the existing owner remains an administrator throughout this test.
  result:=public.kizuna_set_staff_role(administrator,administrator,'admin');
  if result->>'ok'<>'true' or result->>'role'<>'admin' then raise exception 'Owner self-admin assignment failed'; end if;
  begin
    perform public.kizuna_set_staff_role(administrator,administrator,'moderator');raise exception 'Owner self-demoted';
  exception when insufficient_privilege then if sqlerrm<>'SELF_ROLE_PROTECTED' then raise; end if; end;
  begin
    perform public.kizuna_set_staff_role(administrator,administrator,null);raise exception 'Owner removed their own admin role';
  exception when insufficient_privilege then if sqlerrm<>'SELF_ROLE_PROTECTED' then raise; end if; end;
  if not exists(select 1 from public.kizuna_admins where user_id=administrator)
    or (select count(*) from public.kizuna_admins)<1 then raise exception 'Administrator protection failed'; end if;
  result:=public.kizuna_set_staff_role(administrator,fixture,'moderator');
  if result->>'role'<>'moderator' or not exists(select 1 from public.kizuna_moderators where user_id=fixture and granted_by=administrator)
    or exists(select 1 from public.kizuna_admins where user_id=fixture) then raise exception 'Moderator assignment failed'; end if;
  begin
    perform public.kizuna_set_staff_role(fixture,fixture,'admin');raise exception 'Moderator promoted themself';
  exception when insufficient_privilege then if sqlerrm<>'ADMIN_REQUIRED' then raise; end if; end;
  result:=public.kizuna_set_staff_role(administrator,fixture,'admin');
  if result->>'role'<>'admin' or not exists(select 1 from public.kizuna_admins where user_id=fixture)
    or exists(select 1 from public.kizuna_moderators where user_id=fixture) then raise exception 'Admin promotion must remove moderator membership'; end if;
  -- A newly appointed administrator has the requested management permission.
  result:=public.kizuna_set_staff_role(fixture,administrator,'admin');
  if result->>'role'<>'admin' then raise exception 'New administrator cannot manage roles'; end if;
  begin
    perform public.kizuna_set_staff_role(fixture,fixture,null);raise exception 'New administrator self-demoted';
  exception when insufficient_privilege then if sqlerrm<>'SELF_ROLE_PROTECTED' then raise; end if; end;
  insert into private.kizuna_admin_invites(email) values(fixture_email);
  result:=public.kizuna_set_staff_role(administrator,fixture,'moderator');
  if result->>'role'<>'moderator' or exists(select 1 from public.kizuna_admins where user_id=fixture)
    or not exists(select 1 from public.kizuna_moderators where user_id=fixture)
    or exists(select 1 from private.kizuna_admin_invites where email=fixture_email) then raise exception 'Admin demotion or invitation revocation failed'; end if;
  result:=public.kizuna_set_staff_role(administrator,fixture,null);
  if result->>'ok'<>'true' or result->'role'<>'null'::jsonb
    or exists(select 1 from public.kizuna_admins where user_id=fixture)
    or exists(select 1 from public.kizuna_moderators where user_id=fixture) then raise exception 'Player assignment did not remove staff roles'; end if;
  begin
    perform public.kizuna_set_staff_role(fixture,administrator,'moderator');raise exception 'Revoked staff member retained permission';
  exception when insufficient_privilege then if sqlerrm<>'ADMIN_REQUIRED' then raise; end if; end;
  if not exists(select 1 from private.kizuna_staff_audit where action='set_staff_role' and actor_id=administrator
    and target_id=fixture and details->>'oldRole'='moderator' and details->'newRole'='null'::jsonb) then
    raise exception 'Role audit entry was not recorded';
  end if;
  if not exists(select 1 from public.kizuna_admins where user_id=administrator)
    or (select count(*) from public.kizuna_admins)<>administrator_count then raise exception 'Existing administrators changed'; end if;
end;
$$;
select 'passed' as staff_role_permissions,'passed' as admin_promotion,'passed' as self_protection,
  'passed' as owner_preserved,'passed' as invitation_revocation,'passed' as browser_denied;
rollback;
