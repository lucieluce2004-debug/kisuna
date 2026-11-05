-- Lot 3 uses real role checks and RPCs; every fixture/configuration change is rolled back.
begin;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();uid uuid;
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
 r jsonb;t jsonb;cfg jsonb;initial jsonb;live_before jsonb;modified jsonb;bad jsonb;row_test record;node record;
 old_snapshot jsonb;old_unlocks jsonb;old_claims jsonb;preview jsonb;first_preview jsonb;payload jsonb;publish_payload jsonb;stats jsonb;
 rev bigint;first_rev bigint;initial_version integer;published_version integer;req uuid:=gen_random_uuid();
 i_inv1 integer;i_inv2 integer;i_dest1 integer;i_dest2 integer;i_col5 integer;i_album integer;i_echo integer;
 album_id text;album_cards text[];weekly_cards text[];common_cards text[];common_id text;mythic_id text;table_name text;weekly_id uuid;
 balance bigint;amount bigint;count_before bigint;weekly_open_request uuid;day_key text:=((now() at time zone 'Europe/Paris')::date)::text;week_key text:=kizuna_private.nexus_week_start(now())::text;
begin
 perform pg_advisory_xact_lock(17493,700);
 select nc.version into strict initial_version from kizuna_private.kizuna_nexus_config nc where nc.id;
 if initial_version<3 then raise exception 'Base-10 migration must be installed before this suite';end if;
 if has_function_privilege('anon','public.kizuna_nexus_admin(text,jsonb)','execute')
 or not has_function_privilege('authenticated','public.kizuna_nexus_admin(text,jsonb)','execute')
 or (select prosecdef from pg_proc where oid='public.kizuna_nexus_admin(text,jsonb)'::regprocedure)
 then raise exception 'Public administration RPC grant/security mode incorrect';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kizuna_private' and p.proname like 'nexus_admin_%' and has_function_privilege('authenticated',p.oid,'execute')) then raise exception 'Private admin helper exposed';end if;
 foreach table_name in array array['kizuna_nexus_lot_three_backup','kizuna_nexus_admin_draft','kizuna_nexus_admin_history','kizuna_nexus_admin_receipts'] loop
  if has_table_privilege('authenticated','kizuna_private.'||table_name,'select,insert,update,delete') or has_table_privilege('anon','kizuna_private.'||table_name,'select,insert,update,delete')
  or not(select relrowsecurity from pg_class where oid=('kizuna_private.'||table_name)::regclass) then raise exception 'Private admin table exposed: %',table_name;end if;
 end loop;
 insert into auth.users(id,email,is_anonymous) values(a,'nexus3-admin-'||suffix||'@example.invalid',false),(b,'nexus3-player-'||suffix||'@example.invalid',false),(c,'nexus3-mod-'||suffix||'@example.invalid',false);
 insert into public.kizuna_profiles(id,username) values(a,'Nexus3A_'||suffix),(b,'Nexus3B_'||suffix),(c,'Nexus3C_'||suffix);
 insert into public.kizuna_admins(user_id) values(a);
 insert into public.kizuna_moderators(user_id,granted_by) values(c,a);
 foreach uid in array array[a,b,c] loop
  perform set_config('request.jwt.claim.sub',uid::text,true);perform public.kizuna_economy('get');perform public.kizuna_nexus('get','{}');
 end loop;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{chakra}','1000000') where user_id in(a,b,c);
 update kizuna_private.kizuna_nexus_progress set xp=100000000 where user_id in(a,b,c);

 -- Real authenticated roles, including forged user-editable metadata, cannot cross the admin gate.
 foreach uid in array array[b,c] loop
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'user_metadata',jsonb_build_object('role','admin','is_admin',true))::text,true);
  execute 'set local role authenticated';
  begin perform public.kizuna_nexus_admin('get','{}');raise exception 'Non-admin opened administration';exception when insufficient_privilege then if sqlerrm<>'ADMIN_REQUIRED' then raise;end if;end;
  begin perform public.kizuna_nexus_admin('publish','{}');raise exception 'Non-admin attempted publication';exception when insufficient_privilege then if sqlerrm<>'ADMIN_REQUIRED' then raise;end if;end;
  begin perform kizuna_private.nexus_admin_document();raise exception 'Non-admin invoked private helper';exception when insufficient_privilege then null;end;
  begin update kizuna_private.kizuna_nexus_admin_draft set revision=999;raise exception 'Non-admin wrote draft directly';exception when insufficient_privilege then null;end;
  execute 'reset role';
 end loop;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);execute 'set local role authenticated';
 begin perform public.kizuna_nexus_admin('get','{}');raise exception 'Unauthenticated call accepted';exception when insufficient_privilege then if sqlerrm<>'AUTH_REQUIRED' then raise;end if;end;
 execute 'reset role';execute 'set local role anon';
 begin perform public.kizuna_nexus_admin('get','{}');raise exception 'Anonymous call accepted';exception when insufficient_privilege then null;end;
 execute 'reset role';

 -- Build an existing, fully progressed player only through legitimate purchase/claim RPCs.
 perform set_config('request.jwt.claim.sub',b::text,true);
 for node in select * from kizuna_private.kizuna_nexus_nodes order by branch,tier loop
  perform public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',node.id,'configVersion',initial_version,'expectedCost',node.cost),gen_random_uuid());
 end loop;
 perform public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',day_key),gen_random_uuid());
 perform public.kizuna_economy('nexus_reward',jsonb_build_object('key','prestige_daily','periodKey',day_key),gen_random_uuid());
 perform public.kizuna_economy('nexus_reward',jsonb_build_object('key','weekly','periodKey',week_key),gen_random_uuid());
 perform public.kizuna_economy('nexus_reward','{"key":"prestige_once","periodKey":"once"}',gen_random_uuid());
 select id,card_ids into strict album_id,album_cards from kizuna_private.kizuna_nexus_album_rewards order by cardinality(card_ids),id limit 1;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',(select jsonb_agg(jsonb_build_object('id',id,'at',1)) from unnest(album_cards) id)) where user_id=b;
 perform public.kizuna_economy('nexus_reward',jsonb_build_object('key','album:'||album_id,'periodKey','once'),gen_random_uuid());
 update public.kizuna_player_states set snapshot=jsonb_set(jsonb_set(snapshot,'{stock,free}','103'),'{stock,t}',to_jsonb(floor(extract(epoch from now())*1000)::bigint)) where user_id=b;
 select snapshot into old_snapshot from public.kizuna_player_states where user_id=b;
 select jsonb_agg(to_jsonb(u) order by node_id) into old_unlocks from kizuna_private.kizuna_nexus_unlocks u where user_id=b;
 select jsonb_agg(to_jsonb(x) order by reward_key,period_key) into old_claims from kizuna_private.kizuna_nexus_reward_claims x where user_id=b;
 select array_agg(id order by id) into common_cards from(select id from public.kizuna_cards where card->>'rarity'='Commun' order by id limit 6)x;
 select weekly_booster_id into weekly_id from kizuna_private.kizuna_nexus_config where id;
 select array(select x from unnest(card_ids) x order by x) into weekly_cards from public.kizuna_boosters where id=weekly_id;

 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 r:=public.kizuna_nexus_admin('get','{}');initial:=r->'draft';live_before:=r->'live';first_rev:=(r->>'revision')::bigint;rev:=first_rev;
 if (r->>'publishedVersion')::integer<>initial_version or jsonb_array_length(initial->'nodes')<>25 or jsonb_array_length(r->'history')<1 then raise exception 'Admin initial configuration missing';end if;
 select ordinality-1 into i_inv1 from jsonb_array_elements(initial->'nodes') with ordinality x where value->>'id'='invocation_1';
 select ordinality-1 into i_inv2 from jsonb_array_elements(initial->'nodes') with ordinality x where value->>'id'='invocation_2';
 select ordinality-1 into i_dest1 from jsonb_array_elements(initial->'nodes') with ordinality x where value->>'id'='destin_1';
 select ordinality-1 into i_dest2 from jsonb_array_elements(initial->'nodes') with ordinality x where value->>'id'='destin_2';
 select ordinality-1 into i_col5 from jsonb_array_elements(initial->'nodes') with ordinality x where value->>'id'='collection_5';
 select ordinality-1 into i_album from jsonb_array_elements(initial->'albums') with ordinality x where value->>'id'=album_id;
 select ordinality-1 into i_echo from jsonb_array_elements(initial->'cosmetics') with ordinality x where value->>'id'='echo';
 if i_inv1 is null or i_inv2 is null or i_dest1 is null or i_dest2 is null or i_col5 is null or i_album is null or i_echo is null then raise exception 'Required fixture configuration not found';end if;

 -- Every invalid document is rejected atomically, including types, additional keys and bounds.
 for row_test in select * from(values
  ('root null','NEXUS_ADMIN_INVALID_CONFIG','null'::jsonb),
  ('unknown root key','NEXUS_ADMIN_INVALID_CONFIG',initial||'{"isAdmin":true}'),
  ('missing root key','NEXUS_ADMIN_INVALID_CONFIG',initial-'nodes'),
  ('null economy','NEXUS_ADMIN_INVALID_CONFIG',jsonb_set(initial,'{economy}','null')),
  ('unknown economy key','NEXUS_ADMIN_INVALID_CONFIG',jsonb_set(initial,'{economy}',initial->'economy'||'{"odds":100}')),
  ('daily overflow','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,dailyBoosters}','[1,2,2]')),
  ('storage overflow','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,storageBonuses}','[2,2]')),
  ('fractional bonus','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,recycleCapBps}','500.5')),
  ('null bonus','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,weeklyAdvanced}','null')),
  ('string bonus','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,weeklyAdvanced}','"2"')),
  ('negative bonus','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,prestigeDailyChakra}','-1')),
  ('priority overflow','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,priorityBonuses}','[5,10,6]')),
  ('recycle overflow','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,recycleBonuses}','[500,500,501]')),
  ('bonus array null','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,dailyBoosters}','[1,null,2]')),
  ('descending fragment bonus','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,fragmentsAdvanced}','0')),
  ('descending weekly bonus','NEXUS_ADMIN_BOUNDS',jsonb_set(initial,'{economy,weeklyAdvanced}','0')),
  ('missing node','NEXUS_ADMIN_INVALID_NODES',initial#-array['nodes','0']),
  ('duplicate node','NEXUS_ADMIN_INVALID_NODES',jsonb_set(initial,array['nodes',i_dest1::text],initial#>array['nodes',i_inv1::text])),
  ('unknown node','NEXUS_ADMIN_INVALID_NODES',jsonb_set(initial,array['nodes',i_inv1::text,'id'],'"fake_node"')),
  ('fractional node cost','NEXUS_ADMIN_INVALID_NODES',jsonb_set(initial,array['nodes',i_inv1::text,'cost'],'1000.5')),
  ('null node cost','NEXUS_ADMIN_INVALID_NODES',jsonb_set(initial,array['nodes',i_inv1::text,'cost'],'null')),
  ('extra node effect','NEXUS_ADMIN_INVALID_NODES',jsonb_set(initial,array['nodes',i_inv1::text],(initial#>array['nodes',i_inv1::text])||'{"effect":{"value":999}}')),
  ('missing prior rank','NEXUS_ADMIN_PREREQUISITES',jsonb_set(initial,array['nodes',i_inv2::text,'prerequisites'],'[]')),
  ('unknown prerequisite','NEXUS_ADMIN_PREREQUISITES',jsonb_set(initial,array['nodes',i_inv1::text,'prerequisites'],'["fake_node"]')),
  ('self prerequisite','NEXUS_ADMIN_PREREQUISITES',jsonb_set(initial,array['nodes',i_inv1::text,'prerequisites'],'["invocation_1"]')),
  ('duplicate prerequisite','NEXUS_ADMIN_PREREQUISITES',jsonb_set(initial,array['nodes',i_inv2::text,'prerequisites'],'["invocation_1","invocation_1"]')),
  ('level order','NEXUS_ADMIN_LEVEL_ORDER',jsonb_set(initial,array['nodes',i_inv1::text,'requiredLevel'],'4')),
  ('cycle','NEXUS_ADMIN_CYCLE',jsonb_set(jsonb_set(initial,array['nodes',i_inv1::text,'prerequisites'],'["destin_1"]'),array['nodes',i_dest1::text,'prerequisites'],'["invocation_1"]')),
  ('weekly too small','NEXUS_ADMIN_WEEKLY_POOL',jsonb_set(initial,'{weeklyBooster,cardIds}','[]')),
  ('weekly missing rarities','NEXUS_ADMIN_WEEKLY_POOL',jsonb_set(initial,'{weeklyBooster,cardIds}',to_jsonb(common_cards))),
  ('weekly unknown card','NEXUS_ADMIN_WEEKLY_POOL',jsonb_set(initial,'{weeklyBooster,cardIds,0}','"unknown_card"')),
  ('weekly duplicate card','NEXUS_ADMIN_WEEKLY_POOL',jsonb_set(initial,'{weeklyBooster,cardIds}',initial#>'{weeklyBooster,cardIds}'||jsonb_build_array(initial#>'{weeklyBooster,cardIds,0}'))),
  ('cosmetic price','NEXUS_ADMIN_COSMETICS',jsonb_set(initial,array['cosmetics',i_echo::text,'cost'],'0')),
  ('missing cosmetic','NEXUS_ADMIN_COSMETICS',initial#-array['cosmetics','0']),
  ('album overflow','NEXUS_ADMIN_ALBUMS',jsonb_set(initial,array['albums',i_album::text,'chakra'],'10001')),
  ('new unfrozen album','NEXUS_ADMIN_ALBUMS',jsonb_set(initial,array['albums',i_album::text,'id'],'"new_album"'))
 )v(label,expected,config) loop
  begin
   perform public.kizuna_nexus_admin('save',jsonb_build_object('revision',rev,'config',row_test.config));raise exception 'Invalid document accepted: %',row_test.label;
  exception when raise_exception then if sqlerrm<>row_test.expected then raise exception 'Validation % expected %, got %',row_test.label,row_test.expected,sqlerrm;end if;end;
 end loop;
 r:=public.kizuna_nexus_admin('get','{}');if (r->>'revision')::bigint<>rev or r->'draft'<>initial or r->'live'<>live_before then raise exception 'Rejected edits mutated configuration';end if;
 for payload in select value from jsonb_array_elements('[null,[],{"revision":null},{"revision":1,"extra":1}]') loop
  begin perform public.kizuna_nexus_admin('preview',payload);raise exception 'Invalid preview payload accepted';exception when raise_exception then if sqlerrm not in('INVALID_INPUT','REVISION_CONFLICT') then raise;end if;end;
 end loop;
 begin perform public.kizuna_nexus_admin('delete','{}');raise exception 'Unknown action accepted';exception when raise_exception then if sqlerrm<>'INVALID_ACTION' then raise;end if;end;
 begin perform public.kizuna_nexus_admin('get','{"userId":"forged"}');raise exception 'Arbitrary user parameter accepted';exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;

 -- A changed configuration is still a draft until the server preview is confirmed.
 modified:=jsonb_set(initial,'{economy,dailyBoosters}','[1,0,1]');
 modified:=jsonb_set(modified,'{economy,storageBonuses}','[0,0]');modified:=jsonb_set(modified,'{economy,priorityBonuses}','[4,4,4]');
 modified:=jsonb_set(modified,'{economy,recycleBonuses}','[100,200,300]');modified:=jsonb_set(modified,'{economy,recycleCapBps}','550');
 modified:=jsonb_set(modified,'{economy,fragmentsBasic}','2');modified:=jsonb_set(modified,'{economy,fragmentsAdvanced}','3');modified:=jsonb_set(modified,'{economy,fragmentsDailyCap}','7');
 modified:=jsonb_set(modified,'{economy,prestigeDailyChakra}','37');modified:=jsonb_set(modified,'{economy,weeklyBasic}','2');modified:=jsonb_set(modified,'{economy,weeklyAdvanced}','4');
 modified:=jsonb_set(modified,'{economy,prestigeOnceChakra}','2000');modified:=jsonb_set(modified,'{economy,prestigeOncePacks}','8');
 modified:=jsonb_set(modified,array['nodes',i_inv1::text,'enabled'],'false');modified:=jsonb_set(modified,array['nodes',i_inv1::text,'cost'],'1250');
 modified:=jsonb_set(modified,array['nodes',i_dest1::text,'cost'],'1234');modified:=jsonb_set(modified,array['nodes',i_dest2::text,'requiredLevel'],'4');
 modified:=jsonb_set(modified,array['nodes',i_dest2::text,'prerequisites'],'["destin_1","invocation_1"]');
 modified:=jsonb_set(modified,array['nodes',i_col5::text,'cost'],'23456');modified:=jsonb_set(modified,array['cosmetics',i_echo::text,'cost'],'21');
 modified:=jsonb_set(modified,array['albums',i_album::text,'chakra'],'111');modified:=jsonb_set(modified,array['albums',i_album::text,'packs'],'2');
 r:=public.kizuna_nexus_admin('save',jsonb_build_object('revision',rev,'config',modified));rev:=(r->>'revision')::bigint;
 if rev<>first_rev+1 or r->'live'<>live_before or (r->>'publishedVersion')::integer<>initial_version then raise exception 'Draft save affected live configuration';end if;
 t:=public.kizuna_nexus_admin('save',jsonb_build_object('revision',rev,'config',r->'draft'));if t->'revision'<>r->'revision' then raise exception 'Identical save created another revision';end if;
 begin perform public.kizuna_nexus_admin('save',jsonb_build_object('revision',first_rev,'config',modified));raise exception 'Stale save accepted';exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 r:=public.kizuna_nexus_admin('preview',jsonb_build_object('revision',rev));first_preview:=r->'preview';
 if length(first_preview->>'hash')<>32 or jsonb_array_length(first_preview->'changes')<15 or jsonb_array_length(first_preview->'warnings')<2
 or first_preview#>>'{summary,freeCapacity}'<>'10' or first_preview#>>'{summary,recycleBps}'<>'550' or first_preview#>>'{summary,dailyPacks}'<>'2'
 then raise exception 'Preview lacks real changes, warnings or aggregate values';end if;
 modified:=jsonb_set(r->'draft','{weeklyBooster,name}',to_jsonb('Coffret QA Nexus '||suffix));
 r:=public.kizuna_nexus_admin('save',jsonb_build_object('revision',rev,'config',modified));rev:=(r->>'revision')::bigint;
 begin perform public.kizuna_nexus_admin('publish',jsonb_build_object('revision',rev,'expectedVersion',initial_version,'requestId',gen_random_uuid(),'previewHash',first_preview->>'hash'));raise exception 'Outdated preview accepted';exception when raise_exception then if sqlerrm<>'NEXUS_ADMIN_PREVIEW_REQUIRED' then raise;end if;end;
 r:=public.kizuna_nexus_admin('preview',jsonb_build_object('revision',rev));preview:=r->'preview';
 begin perform public.kizuna_nexus_admin('publish',jsonb_build_object('revision',rev,'expectedVersion',initial_version-1,'requestId',gen_random_uuid(),'previewHash',preview->>'hash'));raise exception 'Stale expected live version accepted';exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 begin perform public.kizuna_nexus_admin('publish',jsonb_build_object('revision',first_rev,'expectedVersion',initial_version,'requestId',gen_random_uuid(),'previewHash',preview->>'hash'));raise exception 'Stale publication revision accepted';exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 begin perform public.kizuna_nexus_admin('publish',jsonb_build_object('revision',rev,'expectedVersion',initial_version,'requestId','invalid-id','previewHash',preview->>'hash'));raise exception 'Malformed publication UUID accepted';exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;
 publish_payload:=jsonb_build_object('revision',rev,'expectedVersion',initial_version,'requestId',req,'previewHash',preview->>'hash');
 r:=public.kizuna_nexus_admin('publish',publish_payload);published_version:=(r->>'publishedVersion')::integer;rev:=(r->>'revision')::bigint;
 if published_version<>initial_version+1 or r->>'replayed'<>'false' or (r#>>'{operation,publishedVersion}')::integer<>initial_version+1 or (r->>'publishedRevision')::bigint<>rev then raise exception 'Confirmed publish did not increment the initial version';end if;
 t:=public.kizuna_nexus_admin('publish',publish_payload);
 if t->>'replayed'<>'true' or t->'publishedVersion'<>r->'publishedVersion' or t->'revision'<>r->'revision' then raise exception 'Publish retry created another version';end if;
 begin perform public.kizuna_nexus_admin('publish',jsonb_set(publish_payload,'{expectedVersion}',to_jsonb(initial_version+1)));raise exception 'Publication UUID reused with another payload';exception when raise_exception then if sqlerrm<>'REQUEST_REUSED' then raise;end if;end;
 execute 'reset role';
 if old_snapshot<>(select snapshot from public.kizuna_player_states where user_id=b)
 or old_unlocks<>(select jsonb_agg(to_jsonb(u) order by node_id) from kizuna_private.kizuna_nexus_unlocks u where user_id=b)
 or old_claims<>(select jsonb_agg(to_jsonb(x) order by reward_key,period_key) from kizuna_private.kizuna_nexus_reward_claims x where user_id=b)
 then raise exception 'Publishing rewrote purchased progress, rewards or economic snapshot';end if;
 if (select cost from kizuna_private.kizuna_nexus_unlocks where user_id=b and node_id='collection_5')<>20000 then raise exception 'Historical price changed';end if;
 if (select booster.published from public.kizuna_boosters booster where booster.id=(select nc.weekly_booster_id from kizuna_private.kizuna_nexus_config nc where nc.id)) then raise exception 'Admin published weekly pack into ordinary booster catalogue';end if;
 begin update public.kizuna_boosters set published=true where id=weekly_id;raise exception 'Managed weekly pool entered ordinary catalogue';exception when raise_exception then if sqlerrm<>'NEXUS_WEEKLY_MANAGED' then raise;end if;end;
 begin update public.kizuna_boosters set card_ids=common_cards where id=weekly_id;raise exception 'Managed weekly pool changed outside versioned publication';exception when raise_exception then if sqlerrm<>'NEXUS_WEEKLY_MANAGED' then raise;end if;end;
 begin update public.kizuna_boosters set name='Unreviewed draft edit' where id=weekly_id;raise exception 'Managed weekly name changed outside versioned publication';exception when raise_exception then if sqlerrm<>'NEXUS_WEEKLY_MANAGED' then raise;end if;end;
 if (select array(select x from unnest(card_ids) x order by x) from public.kizuna_boosters where id=weekly_id)<>weekly_cards then raise exception 'Rejected staff edits changed weekly cards';end if;

 -- Actual player RPCs consume the newly published configuration, without stripping past benefits.
 perform set_config('request.jwt.claim.sub',b::text,true);execute 'set local role authenticated';
 r:=public.kizuna_economy('get');t:=public.kizuna_nexus('get','{}');
 if r#>>'{snapshot,stock,free}'<>'103' or r#>>'{snapshot,stock,freeCapacity}'<>'10' then raise exception 'Lowered capacity deleted saved packs';end if;
 if (t->>'configVersion')::integer<>initial_version+1 or t#>>'{bonuses,dailyPacks}'<>'2' or t#>>'{bonuses,prioritySlots}'<>'12' or t#>>'{bonuses,recycleBps}'<>'550'
 or t#>>'{bonuses,fragmentsPerDuplicate}'<>'3' or t#>>'{bonuses,fragmentsDailyCap}'<>'7' or t#>>'{bonuses,prestigeDailyChakra}'<>'37' or t#>>'{bonuses,weeklyPacks}'<>'4'
 or jsonb_array_length(t->'unlocked')<>25 then raise exception 'Published economics or retained acquired nodes incorrect';end if;
 if not exists(select 1 from jsonb_array_elements(t->'nodes') n where n->>'id'='invocation_5' and n->'effect'->>'value'='2' and n->>'description' like '2 %')
 or not exists(select 1 from jsonb_array_elements(t->'nodes') n where n->>'id'='collection_5' and n->'effect'->>'value'='550' and n->>'description' like '5.5 %')
 or not exists(select 1 from jsonb_array_elements(t->'nodes') n where n->>'id'='prestige_2' and n->>'description' like '37 %') then raise exception 'Player descriptions disagree with published bonus values';end if;
 begin perform public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',day_key),gen_random_uuid());raise exception 'Publication reset a daily claim';exception when raise_exception then if sqlerrm<>'NEXUS_DAILY_CLAIMED' then raise;end if;end;
 for payload in select jsonb_build_object('key',k,'periodKey',case k when 'weekly' then week_key when 'prestige_daily' then day_key else 'once' end) from unnest(array['weekly','prestige_daily','prestige_once','album:'||album_id]) k loop
  begin perform public.kizuna_economy('nexus_reward',payload,gen_random_uuid());raise exception 'Publication reset a reward claim';exception when raise_exception then if sqlerrm<>'NEXUS_REWARD_CLAIMED' then raise;end if;end;
 end loop;
 execute 'reset role';
 select id into strict common_id from public.kizuna_cards where card->>'rarity'='Commun' and not(id=any(album_cards)) order by id limit 1;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',snapshot->'owned'||jsonb_build_array(jsonb_build_object('id',common_id,'at',1),jsonb_build_object('id',common_id,'at',2),jsonb_build_object('id',common_id,'at',3))) where user_id=b;
 execute 'set local role authenticated';r:=public.kizuna_economy('get');balance:=(r#>>'{snapshot,chakra}')::bigint;
 r:=public.kizuna_economy('recycle_all',jsonb_build_object('revision',r->'revision'),gen_random_uuid());
 if (r#>>'{snapshot,chakra}')::bigint<>balance+10 or r#>>'{result,nexus,recycleRemainder}'<>'5500' then raise exception 'Configured 5.5 percent recycling did not use exact fraction carry';end if;
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','destin_1','expectedCost',1000,'configVersion',initial_version),gen_random_uuid());raise exception 'Stale player purchase accepted';exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','invocation_1','expectedCost',1250,'configVersion',initial_version+1),gen_random_uuid());raise exception 'Disabled new purchase accepted';exception when raise_exception then if sqlerrm<>'NEXUS_NODE_UNAVAILABLE' then raise;end if;end;
 r:=public.kizuna_economy('get');balance:=(r#>>'{snapshot,chakra}')::bigint;
 r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','destin_1','expectedCost',1234,'configVersion',initial_version+1),gen_random_uuid());
 if (r#>>'{snapshot,chakra}')::bigint<>balance-1234 or r#>>'{result,cost}'<>'1234' then raise exception 'New purchase did not use new price';end if;
 begin perform public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','destin_2','expectedCost',2500,'configVersion',initial_version+1),gen_random_uuid());raise exception 'New cross-branch prerequisite ignored';exception when raise_exception then if sqlerrm<>'NEXUS_PREREQUISITE_REQUIRED' then raise;end if;end;
 execute 'reset role';
 -- A fresh claimant receives the configured amounts; these are not local/UI grants.
 insert into kizuna_private.kizuna_nexus_unlocks(user_id,node_id,cost,config_version)
 select c,id,cost,initial_version+1 from kizuna_private.kizuna_nexus_nodes where id<>'destin_1';
 execute 'set local role authenticated';r:=public.kizuna_economy('get');amount:=(r#>>'{snapshot,stock,inv}')::bigint;
 r:=public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',day_key),gen_random_uuid());if (r#>>'{snapshot,stock,inv}')::bigint<>amount+2 then raise exception 'Configured daily boosters not delivered';end if;
 r:=public.kizuna_economy('nexus_reward',jsonb_build_object('key','weekly','periodKey',week_key),gen_random_uuid());if r#>>'{snapshot,stock,nexusWeekly}'<>'4' then raise exception 'Configured weekly boosters not delivered';end if;
 balance:=(r#>>'{snapshot,chakra}')::bigint;r:=public.kizuna_economy('nexus_reward',jsonb_build_object('key','prestige_daily','periodKey',day_key),gen_random_uuid());if (r#>>'{snapshot,chakra}')::bigint<>balance+37 then raise exception 'Configured daily Chakra not delivered';end if;
 balance:=(r#>>'{snapshot,chakra}')::bigint;amount:=(r#>>'{snapshot,stock,inv}')::bigint;r:=public.kizuna_economy('nexus_reward','{"key":"prestige_once","periodKey":"once"}',gen_random_uuid());
 if (r#>>'{snapshot,chakra}')::bigint<>balance+2000 or (r#>>'{snapshot,stock,inv}')::bigint<>amount+8 then raise exception 'Configured one-time reward not delivered';end if;
 execute 'reset role';
 update public.kizuna_player_states set snapshot=jsonb_set(jsonb_set(snapshot,'{stock,pm}','249'),'{owned}',(select jsonb_agg(jsonb_build_object('id',id,'at',1)) from(
  select unnest(album_cards) id union select id from public.kizuna_cards where id=any(weekly_cards) and card->>'rarity'='Mythique'
 )x)) where user_id=c;
 execute 'set local role authenticated';r:=public.kizuna_economy('get');t:=r;weekly_open_request:=gen_random_uuid();
 r:=public.kizuna_economy('open','{"count":1,"booster":"nexus:weekly"}',weekly_open_request);
 if r#>>'{snapshot,stock,nexusWeekly}'<>'3' or r#>'{snapshot,stock,free}'<>t#>'{snapshot,stock,free}' or r#>'{snapshot,stock,inv}'<>t#>'{snapshot,stock,inv}' or jsonb_array_length(r#>'{result,cards}')<>5 then raise exception 'Configured weekly definition bypassed existing opening/stock rules';end if;
 balance:=(r#>>'{snapshot,chakra}')::bigint;amount:=(r#>>'{snapshot,stock,inv}')::bigint;r:=public.kizuna_economy('nexus_reward',jsonb_build_object('key','album:'||album_id,'periodKey','once'),gen_random_uuid());
 if (r#>>'{snapshot,chakra}')::bigint<>balance+111 or (r#>>'{snapshot,stock,inv}')::bigint<>amount+2 then raise exception 'Configured album reward not delivered';end if;
 execute 'reset role';
 select count(*) into count_before from kizuna_private.kizuna_draw_journal where user_id=c and request_id=weekly_open_request and rarity='Mythique' and duplicate;
 if count_before<1 or coalesce((select (state->>'fragments')::bigint from kizuna_private.kizuna_adventure_players where user_id=c),0)<>least(7,count_before*3) then raise exception 'Configured duplicate fragments not delivered from actual Mythic draw';end if;

 -- Aggregate counters are derived from actual records, with no player identifiers in stats.
 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';r:=public.kizuna_nexus_admin('get','{}');stats:=r->'stats';rev:=(r->>'revision')::bigint;
 execute 'reset role';
 if (stats->>'unlocks')::bigint<>(select count(*) from kizuna_private.kizuna_nexus_unlocks)
 or (stats->>'chakraSpent')::bigint<>(select sum(cost) from kizuna_private.kizuna_nexus_unlocks)
 or (stats->>'dailyClaims')::bigint<>(select count(*) from kizuna_private.kizuna_nexus_daily_claims)
 or (stats->>'weeklyClaims')::bigint<>(select count(*) from kizuna_private.kizuna_nexus_reward_claims where reward_key='weekly')
  or (stats->>'albumClaims')::bigint<>(select count(*) from kizuna_private.kizuna_nexus_reward_claims where reward_key like 'album:%')
  or (stats->>'fragmentsAwarded')::bigint<>(select coalesce(sum(fe.amount),0) from kizuna_private.kizuna_nexus_fragment_events fe)
 or (stats#>>'{granted,chakra}')::bigint<>(select coalesce(sum((result->>'chakra')::bigint),0) from kizuna_private.kizuna_economy_receipts where action in('nexus_daily','nexus_reward'))
 or (stats#>>'{granted,packs}')::bigint<>(select coalesce(sum((result->>'rolls')::bigint),0) from kizuna_private.kizuna_economy_receipts where action in('nexus_daily','nexus_reward'))
 or stats::text like '%'||a::text||'%' or stats::text like '%'||b::text||'%' or stats::text like '%'||c::text||'%' then raise exception 'Admin statistics are not private journal-based aggregates';end if;
 for row_test in select value from jsonb_array_elements(stats->'nodes') loop
  if (row_test.value->>'count')::bigint<>(select count(*) from kizuna_private.kizuna_nexus_unlocks where node_id=row_test.value->>'id') then raise exception 'Per-node aggregate inaccurate';end if;
 end loop;
 execute 'set local role authenticated';
 -- Restore creates a reviewable draft, never rewinds live versions or grants again.
 r:=public.kizuna_nexus_admin('restore',jsonb_build_object('revision',rev,'targetVersion',initial_version));rev:=(r->>'revision')::bigint;
 if (r->>'publishedVersion')::integer<>initial_version+1 or r->'draft'<>initial or r#>>'{live,economy,recycleCapBps}'<>'550' then raise exception 'Restore changed live configuration before publish';end if;
 r:=public.kizuna_nexus_admin('preview',jsonb_build_object('revision',rev));
 r:=public.kizuna_nexus_admin('publish',jsonb_build_object('revision',rev,'expectedVersion',initial_version+1,'requestId',gen_random_uuid(),'previewHash',r#>>'{preview,hash}'));rev:=(r->>'revision')::bigint;
 if (r->>'publishedVersion')::integer<>initial_version+2 or r#>>'{live,economy,recycleCapBps}'<>'1500' or jsonb_array_length(r->'history')<3 then raise exception 'Restore publication did not increment the published version';end if;
 t:=public.kizuna_nexus_admin('publish',publish_payload);if t->>'replayed'<>'true' or (t->>'publishedVersion')::integer<>initial_version+2 or (t#>>'{operation,publishedVersion}')::integer<>initial_version+1 then raise exception 'Old publication replay rewound current state';end if;
 r:=public.kizuna_nexus_admin('preview',jsonb_build_object('revision',rev));
 begin perform public.kizuna_nexus_admin('publish',jsonb_build_object('revision',rev,'expectedVersion',initial_version+2,'requestId',gen_random_uuid(),'previewHash',r#>>'{preview,hash}'));raise exception 'Identical live config republished';exception when raise_exception then if sqlerrm<>'NEXUS_ADMIN_NO_CHANGES' then raise;end if;end;
 begin perform public.kizuna_nexus_admin('restore',jsonb_build_object('revision',rev,'targetVersion',2147483645));raise exception 'Missing history version restored';exception when raise_exception then if sqlerrm<>'VERSION_NOT_FOUND' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',day_key),gen_random_uuid());raise exception 'Restore reset daily claim';exception when raise_exception then if sqlerrm<>'NEXUS_DAILY_CLAIMED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_reward',jsonb_build_object('key','weekly','periodKey',week_key),gen_random_uuid());raise exception 'Restore reset weekly claim';exception when raise_exception then if sqlerrm<>'NEXUS_REWARD_CLAIMED' then raise;end if;end;
 execute 'reset role';
 if old_unlocks<>(select jsonb_agg(to_jsonb(u) order by node_id) from kizuna_private.kizuna_nexus_unlocks u where user_id=b)
 or old_claims<>(select jsonb_agg(to_jsonb(x) order by reward_key,period_key) from kizuna_private.kizuna_nexus_reward_claims x where user_id=b) then raise exception 'Restore rewrote progress or reward history';end if;
 -- Revoke only the administrator created above, by moving its temporary membership
 -- to our temporary moderator. Both identities are checked against this run's names.
 -- ROLLBACK restores the entire transaction, including this membership transfer.
 update public.kizuna_admins set user_id=c where user_id=a
  and exists(select 1 from public.kizuna_profiles where id=a and username='Nexus3A_'||suffix)
  and exists(select 1 from public.kizuna_profiles where id=c and username='Nexus3C_'||suffix);
 get diagnostics count_before=row_count;
 if count_before<>1 then raise exception 'Fixture administrator revocation did not affect exactly its own membership';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 begin perform public.kizuna_nexus_admin('get','{}');raise exception 'Revoked administrator kept access';exception when insufficient_privilege then if sqlerrm<>'ADMIN_REQUIRED' then raise;end if;end;
 begin perform public.kizuna_nexus_admin('publish',publish_payload);raise exception 'Revoked administrator replayed publication';exception when insufficient_privilege then if sqlerrm<>'ADMIN_REQUIRED' then raise;end if;end;
 execute 'reset role';
end;$$;
rollback;
select 'nexus lot3: administration, drafts, preview, publish, history, economics, permissions and rollback passed' as result,
 (select count(*) from public.kizuna_profiles where username like 'Nexus3A_%' or username like 'Nexus3B_%' or username like 'Nexus3C_%') remaining_fixtures;
