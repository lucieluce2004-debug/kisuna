-- Execute after kizuna_staff.sql. Every fixture and state write rolls back.
begin;
do $$
declare
  a uuid:=gen_random_uuid();m uuid:=gen_random_uuid();p uuid:=gen_random_uuid();outside_id uuid:=gen_random_uuid();
  request_id uuid:=gen_random_uuid();overflow_id uuid:=gen_random_uuid();
  suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
  test_name text;
  payload jsonb;
  result jsonb;
  again jsonb;
  pool text[];
  pub_id uuid;
  draft_id uuid;
  original jsonb;
  after_state jsonb;
  action_name text;
  count_rows integer;
begin
  insert into auth.users(id,email,is_anonymous) values
    (a,'qa-staff-a-'||suffix||'@example.invalid',false),(m,'qa-staff-m-'||suffix||'@example.invalid',false),
    (p,'qa-staff-p-'||suffix||'@example.invalid',false),(outside_id,'qa-staff-yugen-'||suffix||'@example.invalid',false);
  insert into public.kizuna_profiles(id,username) values(a,'QAstfA_'||suffix),(m,'QAstfM_'||suffix),(p,'QAstfP_'||suffix);
  insert into public.kizuna_admins(user_id) values(a);
  original:=jsonb_build_object('owned',jsonb_build_array(jsonb_build_object('id','retained-card','at',1700000000000)),
    'pulls','[]'::jsonb,'chakra',500,'username','QAstfP_'||suffix,'stock',jsonb_build_object('inv',2,'pm',11,'pl',7),
    'catalogue','[]'::jsonb,'market',jsonb_build_object('listings','[]'::jsonb));
  insert into public.kizuna_player_states(user_id,snapshot,revision) values(p,original,0);
  if has_function_privilege('anon','public.kizuna_staff_dispatch(uuid,text,jsonb)','execute')
    or has_function_privilege('authenticated','public.kizuna_staff_dispatch(uuid,text,jsonb)','execute')
    or not has_function_privilege('service_role','public.kizuna_staff_dispatch(uuid,text,jsonb)','execute') then
    raise exception 'Service-only RPC grants failed';
  end if;
  if (public.kizuna_staff_dispatch(a,'me','{}')->>'role')<>'admin' then raise exception 'Existing admin role failed'; end if;
  if public.kizuna_staff_dispatch(p,'me','{}')->>'role' is not null then raise exception 'Player gained a role'; end if;
  perform public.kizuna_staff_dispatch(a,'set_moderator',jsonb_build_object('userId',m,'enabled',true));
  if (public.kizuna_staff_dispatch(m,'me','{}')->>'role')<>'moderator' then raise exception 'Moderator assignment failed'; end if;
  result:=public.kizuna_staff_dispatch(m,'list_players',jsonb_build_object('search','QAstfP_'||suffix,'page',1));
  if jsonb_array_length(result->'players')<>1 or result#>>'{players,0,id}'<>p::text
    or result::text like '%@example.invalid%' or result::text like '%retained-card%' then raise exception 'Private staff directory failed'; end if;
  result:=public.kizuna_staff_dispatch(m,'list_players',jsonb_build_object('search','qa-staff-yugen-'||suffix,'page',1));
  if jsonb_array_length(result->'players')<>0 then raise exception 'Unrelated Yugen Auth user exposed'; end if;
  perform public.kizuna_staff_dispatch(m,'review_player',jsonb_build_object('userId',p,'status','reviewed','note','Reviewed fixture'));
  if not exists(select 1 from private.kizuna_account_reviews where user_id=p and reviewed_by=m and reviewed_at is not null) then raise exception 'Moderator review failed'; end if;
  foreach action_name in array array['list_boosters','save_booster','grant_rewards','set_moderator'] loop
    begin
      perform public.kizuna_staff_dispatch(m,action_name,'{}');
      raise exception 'Moderator incorrectly performed %',action_name;
    exception when insufficient_privilege then
      if sqlerrm<>'ADMIN_REQUIRED' then raise; end if;
    end;
  end loop;
  begin
    perform public.kizuna_staff_dispatch(p,'list_players','{}');raise exception 'Player saw staff directory';
  exception when insufficient_privilege then if sqlerrm<>'STAFF_REQUIRED' then raise; end if; end;
  begin
    perform public.kizuna_staff_dispatch(a,'set_moderator',jsonb_build_object('userId',a,'enabled',true));raise exception 'Admin role overwritten';
  exception when insufficient_privilege then if sqlerrm<>'ADMIN_ROLE_PROTECTED' then raise; end if; end;
  select array_agg(id) into pool from (
    select distinct on(card->>'rarity') id from public.kizuna_cards
    where card->>'rarity' in ('Rare','Épique','Légendaire','Mythique') order by card->>'rarity',id
  ) cards;
  if cardinality(pool)<>4 then raise exception 'Expected catalogue rarity fixtures unavailable'; end if;
  result:=public.kizuna_staff_dispatch(a,'save_booster',jsonb_build_object('booster',jsonb_build_object(
    'name','QA published '||suffix,'description','Fixture','card_ids',to_jsonb(pool),'published',true)));
  pub_id:=(result#>>'{booster,id}')::uuid;
  result:=public.kizuna_staff_dispatch(a,'save_booster',jsonb_build_object('booster',jsonb_build_object(
    'name','QA draft '||suffix,'description','','card_ids','[]'::jsonb,'published',false)));
  draft_id:=(result#>>'{booster,id}')::uuid;
  begin
    perform public.kizuna_staff_dispatch(a,'save_booster',jsonb_build_object('booster',jsonb_build_object(
      'name','QA bad '||suffix,'description','','card_ids',to_jsonb(pool[1:1]),'published',true)));
    raise exception 'Published pool missing guarantees was accepted';
  exception when invalid_parameter_value then if sqlerrm<>'MISSING_RARITIES' then raise; end if; end;
  begin
    perform public.kizuna_staff_dispatch(a,'save_booster',jsonb_build_object('booster',jsonb_build_object(
      'name','QA bad '||suffix,'description','','card_ids',jsonb_build_array(pool[1],pool[1]),'published',false)));
    raise exception 'Duplicate card pool accepted';
  exception when invalid_parameter_value then if sqlerrm<>'INVALID_CARD_POOL' then raise; end if; end;
  execute 'set local role anon';
  select count(*) into count_rows from public.kizuna_boosters where id=pub_id;
  if count_rows<>1 then raise exception 'Published booster hidden'; end if;
  select count(*) into count_rows from public.kizuna_boosters where id=draft_id;
  if count_rows<>0 then raise exception 'Draft booster exposed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',p::text,true);
  execute 'set local role authenticated';
  begin
    insert into public.kizuna_moderators(user_id) values(p);raise exception 'Player self-promoted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.kizuna_boosters(name) values('Client injection');raise exception 'Player created a booster';
  exception when insufficient_privilege then null; end;
  begin
    perform public.kizuna_staff_dispatch(a,'me','{}');raise exception 'Player called service-only actor RPC';
  exception when insufficient_privilege then null; end;
  select count(*) into count_rows from public.kizuna_moderators;
  if count_rows<>0 then raise exception 'Player saw another moderator membership'; end if;
  execute 'reset role';
  payload:=jsonb_build_object('userId',p,'rolls',3,'chakra',100,'reason','QA reward','requestId',request_id);
  result:=public.kizuna_staff_dispatch(a,'grant_rewards',payload);
  again:=public.kizuna_staff_dispatch(a,'grant_rewards',payload);
  if (result->>'duplicate')::boolean or not (again->>'duplicate')::boolean then raise exception 'Idempotent grant failed'; end if;
  if (select count(*) from private.kizuna_staff_rewards where id=request_id)<>1 then raise exception 'Reward duplicated'; end if;
  begin
    perform public.kizuna_staff_dispatch(a,'grant_rewards',jsonb_set(payload,'{reason}','"Different reason"'));raise exception 'Request ID silently reused';
  exception when unique_violation then if sqlerrm<>'REQUEST_REUSED' then raise; end if; end;
  begin
    perform public.kizuna_staff_dispatch(a,'grant_rewards',jsonb_set(payload,'{userId}',to_jsonb(outside_id)));raise exception 'Unrelated Auth user received a reward';
  exception when no_data_found then if sqlerrm<>'PLAYER_NOT_FOUND' then raise; end if; end;
  begin
    perform public.kizuna_staff_dispatch(p,'claim_rewards','{"expectedRevision":1}');raise exception 'Stale collection was overwritten';
  exception when serialization_failure then if sqlerrm<>'STATE_CONFLICT' then raise; end if; end;
  if exists(select 1 from private.kizuna_staff_rewards where id=request_id and claimed_at is not null) then raise exception 'Conflict consumed reward'; end if;
  result:=public.kizuna_staff_dispatch(p,'claim_rewards','{"expectedRevision":0}');
  if result->>'claimedCount'<>'1' or result->>'revision'<>'1'
    or result#>>'{snapshot,chakra}'<>'600' or result#>>'{snapshot,stock,inv}'<>'5' then raise exception 'Atomic reward delivery failed'; end if;
  after_state:=result->'snapshot';
  if ((after_state-'chakra')#-'{stock,inv}') is distinct from ((original-'chakra')#-'{stock,inv}') then raise exception 'Reward changed owned cards or other state'; end if;
  result:=public.kizuna_staff_dispatch(p,'claim_rewards','{"expectedRevision":1}');
  if result->>'claimedCount'<>'0' or result->'snapshot'<>'null'::jsonb then raise exception 'Reward claimed twice'; end if;
  perform public.kizuna_staff_dispatch(a,'grant_rewards',jsonb_build_object('userId',p,'rolls',0,'chakra',1,'reason','Overflow fixture','requestId',overflow_id));
  update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{chakra}','1000000000') where user_id=p;
  begin
    perform public.kizuna_staff_dispatch(p,'claim_rewards','{"expectedRevision":1}');raise exception 'Balance overflow silently clipped';
  exception when numeric_value_out_of_range then if sqlerrm<>'BALANCE_LIMIT' then raise; end if; end;
  if exists(select 1 from private.kizuna_staff_rewards where id=overflow_id and claimed_at is not null) then raise exception 'Overflow reward lost'; end if;
  perform public.kizuna_staff_dispatch(a,'set_moderator',jsonb_build_object('userId',m,'enabled',false));
  if public.kizuna_staff_dispatch(m,'me','{}')->>'role' is not null then raise exception 'Role revocation failed'; end if;
end;
$$;
select 'passed' as staff_roles,'passed' as private_directory,'passed' as booster_rls,'passed' as reward_idempotency,'passed' as revision_conflict,'passed' as preservation;
rollback;
