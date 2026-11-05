begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);r jsonb;t jsonb;config jsonb;eid uuid;future uuid;booster uuid;rev bigint;s jsonb;
begin
 perform pg_advisory_xact_lock(17493,700);
 insert into auth.users(id,email,is_anonymous) values(a,'anomaly-a-'||suffix||'@example.invalid',false),(b,'anomaly-b-'||suffix||'@example.invalid',false);
 insert into public.kizuna_profiles(id,username) values(a,'AnomalyA_'||suffix),(b,'AnomalyB_'||suffix);
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.kizuna_anomalies('admin_list');raise exception 'Player admin';exception when insufficient_privilege then null;end;
 insert into public.kizuna_admins(user_id) values(a);
 config:=jsonb_build_object('title','Pilot fixture','description','Rollback only','theme','convergence','starts_at',now()-interval '1 minute','ends_at',now()+interval '1 day','challenges','[
 {"id":"open-one","label":"Open one booster","difficulty":"discovery","metric":"boosters","goal":1,"reward":{"kind":"badge","label":"First badge","style":"convergence"}},
 {"id":"resonance-two","label":"Two resonances","difficulty":"collector","metric":"resonance","goal":2,"reward":{"kind":"frame","label":"Frame test","style":"eclipse"}},
 {"id":"awakening-one","label":"One awakened card","difficulty":"prestige","metric":"awakenings","goal":1,"reward":{"kind":"background","label":"Background test","style":"nocturne"}}]'::jsonb);
 r:=public.kizuna_anomalies('save',jsonb_build_object('config',config));eid:=(r->>'saved_id')::uuid;
 if exists(select 1 from public.kizuna_anomalies where id=eid) then raise exception 'Draft public';end if;
 r:=public.kizuna_anomalies('publish',jsonb_build_object('id',eid,'revision',1));r:=public.kizuna_anomalies('get');
 if r#>>'{events,0,config,challenges,0,value}'<>'0' then raise exception 'Fabricated progress';end if;
 begin perform public.kizuna_anomalies('claim',jsonb_build_object('event',eid,'challenge','open-one'));raise exception 'Premature claim';exception when raise_exception then if sqlerrm<>'REQUIREMENTS_NOT_MET' then raise;end if;end;
 insert into public.kizuna_boosters(name,card_ids,published) values('Anomaly fixture',array['cseed-0013'],true) returning id into booster;
 r:=public.kizuna_economy('get');r:=public.kizuna_economy('open',jsonb_build_object('count',1,'booster','staff:'||booster),gen_random_uuid());s:=r->'snapshot';
 r:=public.kizuna_anomalies('get');if r#>>'{events,0,config,challenges,0,value}'<>'1' or r#>>'{events,0,config,challenges,1,value}'<>'4' or r#>>'{events,0,config,challenges,2,value}'<>'1' then raise exception 'Real event metrics incorrect %',r;end if;
 r:=public.kizuna_anomalies('claim',jsonb_build_object('event',eid,'challenge','open-one'));t:=public.kizuna_anomalies('claim',jsonb_build_object('event',eid,'challenge','open-one'));if jsonb_array_length(t->'rewards')<>1 then raise exception 'Double claim';end if;
 r:=public.kizuna_anomalies('claim',jsonb_build_object('event',eid,'challenge','resonance-two'));
 r:=public.kizuna_anomalies('equip',jsonb_build_object('kind','badge','key',eid||':open-one'));r:=public.kizuna_anomalies('equip',jsonb_build_object('kind','frame','key',eid||':resonance-two'));if r#>>'{selection,badge}' is null or r#>>'{selection,frame}' is null then raise exception 'Cosmetic selection not preserved';end if;
 t:=public.kizuna_economy('get');if t->'snapshot'<>s then raise exception 'Cosmetics changed economy';end if;
 r:=public.kizuna_anomalies('participants',jsonb_build_object('id',eid));if jsonb_array_length(r->'participants')<>1 or r#>>'{participants,0,rewards}'<>'2' then raise exception 'Participation not actual';end if;
 config:=jsonb_set(config,'{challenges,0,goal}','2');r:=public.kizuna_anomalies('save',jsonb_build_object('id',eid,'revision',2,'config',config));
 begin perform public.kizuna_anomalies('publish',jsonb_build_object('id',eid,'revision',3));raise exception 'Active requirements changed';exception when raise_exception then if sqlerrm<>'EVENT_STARTED' then raise;end if;end;
 r:=public.kizuna_anomalies('toggle',jsonb_build_object('id',eid,'revision',3,'enabled',false));
 begin perform public.kizuna_anomalies('claim',jsonb_build_object('event',eid,'challenge','awakening-one'));raise exception 'Inactive claim';exception when raise_exception then if sqlerrm<>'EVENT_INACTIVE' then raise;end if;end;
 config:=jsonb_set(jsonb_set(config,'{starts_at}',to_jsonb(now()+interval '1 day')),'{ends_at}',to_jsonb(now()+interval '2 days'));r:=public.kizuna_anomalies('save',jsonb_build_object('config',config));future:=(r->>'saved_id')::uuid;r:=public.kizuna_anomalies('publish',jsonb_build_object('id',future,'revision',1));
 r:=public.kizuna_anomalies('get');if r#>>'{events,0,config,challenges,0,value}'<>'0' then raise exception 'Outside event window counted';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);r:=public.kizuna_anomalies('get');if r->'rewards'<>'[]'::jsonb or r->'selection'<>'{}'::jsonb then raise exception 'Other player cosmetics leaked';end if;
 begin perform public.kizuna_anomalies('equip',jsonb_build_object('kind','badge','key',eid||':open-one'));raise exception 'Other player reward equipped';exception when raise_exception then if sqlerrm<>'REWARD_LOCKED' then raise;end if;end;
 begin perform public.kizuna_anomalies('participants',jsonb_build_object('id',eid));raise exception 'Player saw participants';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 -- Global feature flag, server expiry and archive preserve previously earned cosmetics.
 r:=public.kizuna_anomalies('toggle',jsonb_build_object('id',eid,'revision',4,'enabled',true));
 update public.kizuna_live_design l set config=jsonb_set(l.config,'{features,events}','false') where id;
 begin perform public.kizuna_anomalies('claim',jsonb_build_object('event',eid,'challenge','awakening-one'));raise exception 'Global disable bypassed';exception when raise_exception then if sqlerrm<>'FEATURE_DISABLED' then raise;end if;end;
 update public.kizuna_live_design l set config=jsonb_set(l.config,'{features,events}','true') where id;
 update public.kizuna_anomalies aev set config=jsonb_set(aev.config,'{ends_at}',to_jsonb(now()-interval '1 second')) where id=eid;
 begin perform public.kizuna_anomalies('claim',jsonb_build_object('event',eid,'challenge','awakening-one'));raise exception 'Expired claim';exception when raise_exception then if sqlerrm<>'EVENT_INACTIVE' then raise;end if;end;
 r:=public.kizuna_anomalies('archive',jsonb_build_object('id',eid,'revision',5));r:=public.kizuna_anomalies('get');if jsonb_array_length(r->'rewards')<>2 then raise exception 'Archive lost rewards';end if;
 delete from public.kizuna_admins where user_id=a;
 begin perform public.kizuna_anomalies('admin_list');raise exception 'Revoked admin still authorized';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','kizuna_private.anomaly_enrol(uuid)','execute') or has_table_privilege('authenticated','public.kizuna_anomalies','insert,update,delete') or has_table_privilege('anon','kizuna_private.kizuna_anomaly_claims','select') then raise exception 'Unsafe grants';end if;
end; $$;
rollback;
