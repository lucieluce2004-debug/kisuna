begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();s text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);r jsonb;
begin
 if has_table_privilege('authenticated','public.kizuna_player_states','insert,update,delete') then raise exception 'Browser snapshot writes remain';end if;
 if has_table_privilege('authenticated','kizuna_private.kizuna_market_listings','select,insert,update,delete') or has_table_privilege('anon','kizuna_private.kizuna_economy_archive','select') then raise exception 'Private economic data exposed';end if;
 if has_function_privilege('anon','public.kizuna_economy(text,jsonb,uuid)','execute') or has_function_privilege('authenticated','kizuna_private.econ_deliver(uuid,jsonb,bigint,text)','execute') then raise exception 'Privileged helper exposed';end if;
 insert into auth.users(id,email,is_anonymous) values(a,'econ-rls-a-'||s||'@example.invalid',false),(b,'econ-rls-b-'||s||'@example.invalid',false);
 insert into public.kizuna_profiles(id,username) values(a,'EconRlsA_'||s),(b,'EconRlsB_'||s);
 perform set_config('request.jwt.claim.sub',a::text,true);perform public.kizuna_economy('get');
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.kizuna_economy('get');
 execute 'set local role authenticated';
 if (select count(*) from public.kizuna_player_states)<>1 then raise exception 'Other player snapshot exposed';end if;
 begin update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{chakra}','999999');raise exception 'Forged balance accepted';exception when insufficient_privilege then null;end;
 begin insert into public.kizuna_player_states(user_id,snapshot) values(b,'{"owned":[],"pulls":[]}');raise exception 'Forged initial state accepted';exception when insufficient_privilege then null;end;
 r:=public.kizuna_economy('get',jsonb_build_object('user_id',a,'chakra',999999,'owned','[]'));
 if r#>>'{snapshot,username}'<>'EconRlsB_'||s or r#>>'{snapshot,chakra}'<>'500' then raise exception 'Caller chose identity or balance';end if;
 begin perform kizuna_private.econ_deliver(b,null,100000,'forged');raise exception 'Helper allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';
end; $$;
rollback;
