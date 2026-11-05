-- Extend staff management without changing the existing staff dispatcher.
-- The only caller is the Edge service after Auth.getUser verifies p_actor.
create function private.kizuna_set_staff_role(p_actor uuid,p_target uuid,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  previous_role text;
  administrator_count bigint;
  target_email text;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor and is_anonymous=false) then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  -- All role changes share this lock, independent of actor/target. Recheck the
  -- acting administrator AFTER waiting so two cross-demotions cannot remove
  -- every admin: the loser sees its revoked membership and is refused.
  perform pg_catalog.pg_advisory_xact_lock(17493,300);
  if not exists(select 1 from public.kizuna_admins where user_id=p_actor) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_target is null or (p_role is not null and p_role not in ('admin','moderator')) then
    raise exception 'INVALID_INPUT' using errcode='22023';
  end if;
  perform 1 from public.kizuna_profiles where id=p_target for update;
  if not found then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  previous_role:=private.kizuna_staff_role(p_target);
  if p_actor=p_target and p_role is distinct from 'admin' then
    raise exception 'SELF_ROLE_PROTECTED' using errcode='42501';
  end if;
  if previous_role='admin' and p_role is distinct from 'admin' then
    select count(*) into administrator_count from public.kizuna_admins;
    if administrator_count<=1 then
      raise exception 'LAST_ADMIN_PROTECTED' using errcode='42501';
    end if;
  end if;
  if p_role='admin' then
    insert into public.kizuna_admins(user_id) values(p_target) on conflict(user_id) do nothing;
    delete from public.kizuna_moderators where user_id=p_target;
  elsif p_role='moderator' then
    insert into public.kizuna_moderators(user_id,granted_by) values(p_target,p_actor)
      on conflict(user_id) do nothing;
    delete from public.kizuna_admins where user_id=p_target;
  else
    delete from public.kizuna_admins where user_id=p_target;
    delete from public.kizuna_moderators where user_id=p_target;
  end if;
  if p_role is distinct from 'admin' then
    -- An old invitation must not restore a deliberately revoked admin role.
    select lower(btrim(email)) into target_email from auth.users where id=p_target;
    if target_email is not null then
      delete from private.kizuna_admin_invites where email=target_email;
    end if;
  end if;
  insert into private.kizuna_staff_audit(actor_id,action,target_id,details)
    values(p_actor,'set_staff_role',p_target,jsonb_build_object('oldRole',previous_role,'newRole',p_role));
  return jsonb_build_object('ok',true,'role',p_role);
end;
$$;

create function public.kizuna_set_staff_role(p_actor uuid,p_target uuid,p_role text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.kizuna_set_staff_role(p_actor,p_target,p_role);
$$;
revoke all on function private.kizuna_set_staff_role(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.kizuna_set_staff_role(uuid,uuid,text) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.kizuna_set_staff_role(uuid,uuid,text),public.kizuna_set_staff_role(uuid,uuid,text) to service_role;
