-- Actual RPC checks for the new /10 recharge display and retained historical stock.
begin;
do $$declare u uuid:=gen_random_uuid();suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);r jsonb;n jsonb;a jsonb;cv integer;cost bigint;node record;nowms bigint:=floor(extract(epoch from now())*1000)::bigint;before_owned jsonb;old_inv bigint;
begin
 perform pg_advisory_xact_lock(17493,700);
 select c.version into cv from kizuna_private.kizuna_nexus_config c where c.id;
 if cv<>3 then raise exception 'Capacity migration must publish version 3';end if;
 if not exists(select 1 from kizuna_private.kizuna_nexus_admin_history h where h.version=3 and h.actor is null and h.summary->>'reason'='user_requested_base_capacity_10') then raise exception 'System capacity publication is missing';end if;
 a:=kizuna_private.nexus_admin_snapshot();
 if a->'draft'<>a->'live' or a->'revision'<>a->'publishedRevision' or a->>'publishedVersion'<>'3' then raise exception 'Clean draft/live publication state is inconsistent';end if;
 if (kizuna_private.nexus_admin_preview(a->'live',(a->>'revision')::bigint,cv)#>>'{summary,freeCapacity}')<>'13' then raise exception 'Admin preview does not use base 10 plus Nexus 3';end if;
 insert into auth.users(id,email,is_anonymous) values(u,'capacity10-'||suffix||'@example.invalid',false);
 insert into public.kizuna_profiles(id,username) values(u,'Capacity10_'||suffix);
 perform set_config('request.jwt.claim.sub',u::text,true);
 r:=public.kizuna_economy('get');n:=public.kizuna_nexus('get','{}');
 if r#>>'{snapshot,stock,free}'<>'3' or r#>>'{snapshot,stock,freeCapacity}'<>'10' or n#>>'{bonuses,freeCapacity}'<>'10' then raise exception 'Starting stock must remain 3 with capacity 10';end if;
 old_inv:=(r#>>'{snapshot,stock,inv}')::bigint;
 update public.kizuna_player_states set snapshot=jsonb_set(jsonb_set(snapshot,'{stock,free}','9'),'{stock,t}',to_jsonb(nowms-21600000::bigint*3)) where user_id=u;
 r:=public.kizuna_economy('get');if r#>>'{snapshot,stock,free}'<>'10' or (r#>>'{snapshot,stock,inv}')::bigint<>old_inv then raise exception 'Recharge must stop at 10 without modifying bonus packs';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{chakra}','1000000') where user_id=u;
 update kizuna_private.kizuna_nexus_progress set xp=100000 where user_id=u;
 for node in select * from kizuna_private.kizuna_nexus_nodes where branch='invocation' and tier<=4 order by tier loop
  r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',node.id,'expectedCost',node.cost,'configVersion',cv),gen_random_uuid());
  if node.tier=2 and r#>>'{snapshot,stock,freeCapacity}'<>'11' then raise exception 'Invocation II must increase capacity to 11';end if;
  if node.tier=4 and r#>>'{snapshot,stock,freeCapacity}'<>'13' then raise exception 'Invocation IV must increase capacity to 13';end if;
 end loop;
 if r#>>'{snapshot,stock,free}'<>'10' then raise exception 'Buying capacity must not mint boosters';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,t}',to_jsonb(nowms-21600000::bigint*5)) where user_id=u;
 r:=public.kizuna_economy('get');if r#>>'{snapshot,stock,free}'<>'13' then raise exception 'Extended recharge must stop at 13';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(jsonb_set(snapshot,'{stock,free}','103'),'{stock,t}',to_jsonb(nowms-21600000::bigint*5)) where user_id=u;
 r:=public.kizuna_economy('get');before_owned:=r#>'{snapshot,owned}';
 if r#>>'{snapshot,stock,free}'<>'103' or r#>>'{snapshot,stock,freeCapacity}'<>'13' then raise exception 'Historical stock above 13 must not be clamped';end if;
 r:=public.kizuna_economy('open','{"count":1,"booster":"mix"}',gen_random_uuid());
 if r#>>'{snapshot,stock,free}'<>'102' or (r#>>'{snapshot,stock,inv}')::bigint<>old_inv or jsonb_array_length(r#>'{snapshot,owned}')<>jsonb_array_length(before_owned)+5 then raise exception 'Historical stock is still spendable through the real draw engine';end if;
 begin perform public.kizuna_economy('nexus_buy','{"nodeId":"destin_1","expectedCost":1000,"configVersion":2}',gen_random_uuid());raise exception 'Old price confirmation accepted after system publication';exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 if not exists(select 1 from kizuna_private.kizuna_nexus_nodes where id='invocation_2' and description like '%11 boosters%') or not exists(select 1 from kizuna_private.kizuna_nexus_nodes where id='invocation_4' and description like '%13 boosters%') then raise exception 'Capacity descriptions are stale';end if;
end; $$;
rollback;
select 'free capacity 10: initial 3, recharge 10/11/13, retained historical 103, real opening and configuration history passed; fixtures rolled back' result;
