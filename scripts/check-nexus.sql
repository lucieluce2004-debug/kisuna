-- Nexus Lot 1 integration checks. Run with the project's migration/test role.
-- Historical suite for Nexus configuration version 1 (five enabled nodes).
-- After Lot 2, use check-nexus-lot2.sql: it checks the expanded version-2 contract.
-- Every identity, configuration fixture and economic operation is rolled back.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
 r jsonb; t jsonb; n jsonb; before_n jsonb; payload jsonb; req uuid; booster uuid; mythic_booster uuid; anomaly_id uuid;
 common_id text; other_id text; mythic_id text; ids text[]; node_id text; table_name text;
 balance bigint; rev bigint; inv bigint; xp bigint; gained bigint; count_before integer; mythic_levels integer;
 original_level integer; original_prerequisites text[]; rejected boolean; expected_day text; expected_reset timestamptz;
begin
 perform pg_advisory_xact_lock(17493,700);
 if has_function_privilege('anon','public.kizuna_nexus(text,jsonb)','execute')
    or not has_function_privilege('authenticated','public.kizuna_nexus(text,jsonb)','execute')
    or (select prosecdef from pg_proc where oid='public.kizuna_nexus(text,jsonb)'::regprocedure)
 then raise exception 'Nexus public RPC permissions/security mode';end if;
 foreach table_name in array array['kizuna_nexus_config','kizuna_nexus_nodes','kizuna_nexus_progress','kizuna_nexus_unlocks','kizuna_nexus_daily_claims','kizuna_nexus_xp_events','kizuna_nexus_discoveries'] loop
  if has_table_privilege('authenticated','kizuna_private.'||table_name,'select,insert,update,delete')
     or has_table_privilege('anon','kizuna_private.'||table_name,'select,insert,update,delete')
     or not (select relrowsecurity from pg_class where oid=('kizuna_private.'||table_name)::regclass)
  then raise exception 'Nexus private table exposed: %',table_name;end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='kizuna_private' and p.proname like 'nexus_%'
   and has_function_privilege('authenticated',p.oid,'execute'))
 then raise exception 'Privileged Nexus helper exposed';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.kizuna_nexus('get','{}');raise exception 'Unauthenticated Nexus read accepted';
 exception when insufficient_privilege then null;end;

 select id into strict common_id from public.kizuna_cards where card->>'rarity'='Commun' order by id limit 1;
 select id into strict other_id from public.kizuna_cards where id<>common_id order by id limit 1;
 select c.id into strict mythic_id from public.kizuna_cards c join public.kizuna_mythic_forms f on f.card_id=c.id where c.card->>'rarity'='Mythique' order by c.id limit 1;
 select array_agg(id order by id) into ids from (select id from public.kizuna_cards order by id limit 6) x;
 if cardinality(ids)<>6 then raise exception 'Catalogue needs six canonical cards for priority checks';end if;
 insert into auth.users(id,email,is_anonymous) values(a,'nexus-a-'||suffix||'@example.invalid',false),(b,'nexus-b-'||suffix||'@example.invalid',false);
 insert into public.kizuna_profiles(id,username) values(a,'NexusA_'||suffix),(b,'NexusB_'||suffix);
 perform set_config('request.jwt.claim.sub',a::text,true);
 r:=public.kizuna_economy('get');n:=public.kizuna_nexus('get','{}');
 if not n ?& array['configVersion','stateRevision','xp','level','levelFloor','nextLevelXp','nodes','unlocked','bonuses','daily','preferences','recycleRemainder','serverNow','timezone']
    or not (n->'bonuses') ?& array['dailyPacks','prioritySlots','recycleBps','awakenedGallery','profileFrame']
    or not (n->'daily') ?& array['available','claimed','periodKey','nextResetAt','count']
 then raise exception 'Incomplete Nexus response contract';end if;
 if jsonb_array_length(n->'nodes')<>25 or (select count(*) from jsonb_array_elements(n->'nodes') x where (x->>'enabled')::boolean)<>5
    or n->'unlocked'<>'[]'::jsonb or n->>'xp'<>'0' or n->>'level'<>'1'
 then raise exception 'Initial Nexus is not five active nodes and twenty planned nodes';end if;
 if n#>>'{bonuses,dailyPacks}'<>'0' or n#>>'{bonuses,recycleBps}'<>'0' or n#>>'{preferences,frame}'<>'' then raise exception 'Unpurchased benefit granted';end if;
 payload:='{"nodeId":"invocation_1","configVersion":1,"expectedCost":1000}';
 begin perform public.kizuna_economy('nexus_buy',payload,gen_random_uuid());raise exception 'Insufficient balance accepted';
 exception when raise_exception then if sqlerrm<>'INSUFFICIENT_CHAKRA' then raise;end if;end;
 if (select snapshot->>'chakra' from public.kizuna_player_states where user_id=a)<>'500' or exists(select 1 from kizuna_private.kizuna_nexus_unlocks where user_id=a) then raise exception 'Failed buy was not atomic';end if;
 begin perform public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',n#>>'{daily,periodKey}'),gen_random_uuid());raise exception 'Locked daily claimed';
 exception when raise_exception then if sqlerrm<>'NEXUS_DAILY_LOCKED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_preferences','{"frame":"nexus"}',gen_random_uuid());raise exception 'Locked frame equipped';
 exception when raise_exception then if sqlerrm<>'NEXUS_FRAME_LOCKED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',array[common_id]),gen_random_uuid());raise exception 'Locked priorities used';
 exception when raise_exception then if sqlerrm<>'NEXUS_PRIORITY_LOCKED' then raise;end if;end;

 -- Only privileged fixtures can change balances or configuration. Browsers cannot.
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{chakra}','15000') where user_id=a;
 begin perform public.kizuna_economy('nexus_buy',payload||'{"configVersion":999}',gen_random_uuid());raise exception 'Old configuration accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_buy',payload||'{"expectedCost":1}',gen_random_uuid());raise exception 'Client chose purchase price';
 exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_buy','{"nodeId":"invocation_2","configVersion":1,"expectedCost":2500}',gen_random_uuid());raise exception 'Planned node purchased';
 exception when raise_exception then if sqlerrm<>'NEXUS_NODE_UNAVAILABLE' then raise;end if;end;
 select required_level,prerequisites into original_level,original_prerequisites from kizuna_private.kizuna_nexus_nodes where id='invocation_1';
 update kizuna_private.kizuna_nexus_nodes set required_level=2 where id='invocation_1';
 begin perform public.kizuna_economy('nexus_buy',payload,gen_random_uuid());raise exception 'Level requirement ignored';
 exception when raise_exception then if sqlerrm<>'NEXUS_LEVEL_REQUIRED' then raise;end if;end;
 update kizuna_private.kizuna_nexus_nodes set required_level=original_level,prerequisites=array['prestige_1'] where id='invocation_1';
 begin perform public.kizuna_economy('nexus_buy',payload,gen_random_uuid());raise exception 'Prerequisite ignored';
 exception when raise_exception then if sqlerrm<>'NEXUS_PREREQUISITE_REQUIRED' then raise;end if;end;
 update kizuna_private.kizuna_nexus_nodes set prerequisites=original_prerequisites where id='invocation_1';
 req:=gen_random_uuid();r:=public.kizuna_economy('nexus_buy',payload,req);t:=public.kizuna_economy('nexus_buy',payload,req);
 if r#>>'{snapshot,chakra}'<>'14000' or t#>>'{snapshot,chakra}'<>'14000' or not (t->>'replayed')::boolean
    or (select count(*) from kizuna_private.kizuna_nexus_unlocks where user_id=a)<>1 then raise exception 'Purchase replay charged/unlocked twice';end if;
 begin perform public.kizuna_economy('nexus_buy',payload||'{"nodeId":"destin_1"}',req);raise exception 'Request reused with different payload';
 exception when raise_exception then if sqlerrm<>'REQUEST_REUSED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_buy',payload,gen_random_uuid());raise exception 'Already owned node charged';
 exception when raise_exception then if sqlerrm<>'NEXUS_ALREADY_UNLOCKED' then raise;end if;end;
 foreach node_id in array array['destin_1','resonance_1','collection_1','prestige_1'] loop
  r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',node_id,'configVersion',1,'expectedCost',1000),gen_random_uuid());
 end loop;
 n:=public.kizuna_nexus('get','{}');
 if r#>>'{snapshot,chakra}'<>'10000' or jsonb_array_length(n->'unlocked')<>5
    or n#>>'{bonuses,dailyPacks}'<>'1' or n#>>'{bonuses,prioritySlots}'<>'5'
    or n#>>'{bonuses,recycleBps}'<>'500' or n#>>'{bonuses,awakenedGallery}'<>'true'
    or n#>>'{bonuses,profileFrame}'<>'nexus' then raise exception 'Five tier-one benefits incorrect';end if;

 -- Paris daily bonus is separate from the existing UTC three-pack gift.
 expected_day:=to_char(now() at time zone 'Europe/Paris','YYYY-MM-DD');
 expected_reset:=((now() at time zone 'Europe/Paris')::date+1)::timestamp at time zone 'Europe/Paris';
 if n#>>'{daily,periodKey}'<>expected_day or (n#>>'{daily,nextResetAt}')::timestamptz<>expected_reset or n#>>'{daily,available}'<>'true' then raise exception 'Wrong Paris reward boundary';end if;
 if kizuna_private.nexus_next_reset('2026-03-29 00:00 Europe/Paris'::timestamptz)-'2026-03-29 00:00 Europe/Paris'::timestamptz<>interval '23 hours'
    or kizuna_private.nexus_next_reset('2026-10-25 00:00 Europe/Paris'::timestamptz)-'2026-10-25 00:00 Europe/Paris'::timestamptz<>interval '25 hours' then raise exception 'Paris DST reset incorrect';end if;
 begin perform public.kizuna_economy('nexus_daily','{"periodKey":"2000-01-01"}',gen_random_uuid());raise exception 'Expired period accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_PERIOD_CHANGED' then raise;end if;end;
 inv:=(r#>>'{snapshot,stock,inv}')::bigint;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,inv}','1000000') where user_id=a;
 begin perform public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',expected_day),gen_random_uuid());raise exception 'Reward stock limit bypassed';
 exception when raise_exception then if sqlerrm<>'BALANCE_LIMIT' then raise;end if;end;
 if exists(select 1 from kizuna_private.kizuna_nexus_daily_claims where user_id=a) then raise exception 'Failed daily delivery consumed the claim';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,inv}',to_jsonb(inv)) where user_id=a;
 inv:=(r#>>'{snapshot,stock,inv}')::bigint;req:=gen_random_uuid();payload:=jsonb_build_object('periodKey',expected_day);
 r:=public.kizuna_economy('nexus_daily',payload,req);t:=public.kizuna_economy('nexus_daily',payload,req);
 if (t#>>'{snapshot,stock,inv}')::bigint<>inv+1 or r#>>'{result,nexus,daily,claimed}'<>'true' then raise exception 'Daily reward replay or returned state wrong';end if;
 begin perform public.kizuna_economy('nexus_daily',payload,gen_random_uuid());raise exception 'Second daily reward accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_DAILY_CLAIMED' then raise;end if;end;
 r:=public.kizuna_economy('daily','{}',gen_random_uuid());
 if (r#>>'{snapshot,stock,inv}')::bigint<>inv+4 then raise exception 'Nexus replaced existing UTC daily gift';end if;

 -- Priorities add useful persistent tracking without shrinking the existing wishlist.
 r:=public.kizuna_economy('preferences',jsonb_build_object('wishlist',array[ids[6]]),gen_random_uuid());
 begin perform public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',ids),gen_random_uuid());raise exception 'Six priorities accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_PRIORITY_LIMIT' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_preferences','{"priorityCardIds":["not-a-canonical-card"]}',gen_random_uuid());raise exception 'Unknown priority accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;
 r:=public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',ids[1:5],'frame','nexus'),gen_random_uuid());
 if jsonb_array_length(r#>'{result,nexus,preferences,priorityCardIds}')<>5
    or r#>>'{result,nexus,preferences,frame}'<>'nexus'
    or not (r#>'{snapshot,market,wishlist}') ?& ids then raise exception 'Priority tracking/frame/wishlist preservation failed';end if;
 r:=public.kizuna_economy('nexus_preferences','{"priorityCardIds":[],"frame":""}',gen_random_uuid());
 if r#>>'{result,nexus,preferences,frame}'<>'' or not (r#>'{snapshot,market,wishlist}') ?& ids then raise exception 'Removing priorities erased acquired wishlist';end if;

 -- +5% is restricted to duplicate copies and carries sub-Chakra fractions across operations.
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',jsonb_build_array(jsonb_build_object('id',common_id,'at',1),jsonb_build_object('id',common_id,'at',2),jsonb_build_object('id',common_id,'at',3))) where user_id=a;
 r:=public.kizuna_economy('get');balance:=(r#>>'{snapshot,chakra}')::bigint;rev:=(r->>'revision')::bigint;req:=gen_random_uuid();payload:=jsonb_build_object('revision',rev);
 r:=public.kizuna_economy('recycle_all',payload,req);t:=public.kizuna_economy('recycle_all',payload,req);
 n:=public.kizuna_nexus('get','{}');
 if (r#>>'{snapshot,chakra}')::bigint<>balance+10 or t#>>'{snapshot,chakra}'<>r#>>'{snapshot,chakra}'
    or jsonb_array_length(r#>'{snapshot,owned}')<>1 or n->>'recycleRemainder'<>'5000' then raise exception 'Fractional first recycling bonus/replay wrong';end if;
 begin perform public.kizuna_economy('recycle_all',payload,gen_random_uuid());raise exception 'Stale recycle revision accepted';
 exception when raise_exception then if sqlerrm<>'STATE_CONFLICT' then raise;end if;end;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',jsonb_build_array(jsonb_build_object('id',common_id,'at',1),jsonb_build_object('id',common_id,'at',4),jsonb_build_object('id',common_id,'at',5))) where user_id=a;
 r:=public.kizuna_economy('get');balance:=(r#>>'{snapshot,chakra}')::bigint;
 r:=public.kizuna_economy('recycle_all',jsonb_build_object('revision',r->'revision'),gen_random_uuid());n:=public.kizuna_nexus('get','{}');
 if (r#>>'{snapshot,chakra}')::bigint<>balance+11 or n->>'recycleRemainder'<>'0' then raise exception 'Two half-Chakra bonuses did not accumulate into one Chakra';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',jsonb_build_array(jsonb_build_object('id',common_id,'at',1),jsonb_build_object('id',common_id,'at',6))) where user_id=a;
 r:=public.kizuna_economy('get');balance:=(r#>>'{snapshot,chakra}')::bigint;
 r:=public.kizuna_economy('recycle',jsonb_build_object('cardId',common_id,'revision',r->'revision'),gen_random_uuid());n:=public.kizuna_nexus('get','{}');
 if (r#>>'{snapshot,chakra}')::bigint<>balance+5 or n->>'recycleRemainder'<>'2500' then raise exception 'Individual duplicate bonus omitted';end if;
 r:=public.kizuna_economy('recycle',jsonb_build_object('cardId',common_id,'revision',r->'revision'),gen_random_uuid());n:=public.kizuna_nexus('get','{}');
 if (r#>>'{snapshot,chakra}')::bigint<>balance+10 or jsonb_array_length(r#>'{snapshot,owned}')<>0 or n->>'recycleRemainder'<>'2500' then raise exception 'Unique copy received duplicate bonus or became unrecyclable';end if;

 -- Real deterministic openings exercise the installed draw journal and XP hooks.
 -- A temporary real anomaly observes these openings; its claim is checked below.
 update public.kizuna_live_design set config=jsonb_set(jsonb_set(jsonb_set(config,'{features,events}','true'),'{features,missions}','true'),'{features,journey}','true') where id;
 insert into public.kizuna_admins(user_id) values(a);
 r:=public.kizuna_anomalies('save',jsonb_build_object('config',jsonb_build_object('title','Nexus rollback anomaly','description','Transaction-only XP fixture','theme','convergence','starts_at',now()-interval '1 minute','ends_at',now()+interval '1 day','challenges','[{"id":"open-one","label":"Open one booster","difficulty":"discovery","metric":"boosters","goal":1,"reward":{"kind":"badge","label":"Nexus fixture badge","style":"convergence"}}]'::jsonb)));
 anomaly_id:=(r->>'saved_id')::uuid;
 perform public.kizuna_anomalies('publish',jsonb_build_object('id',anomaly_id,'revision',1));
 delete from public.kizuna_admins where user_id=a;
 insert into public.kizuna_boosters(name,description,card_ids,card_count,published) values('Nexus common fixture','Rollback only',array[common_id],5,true) returning id into booster;
 insert into public.kizuna_boosters(name,description,card_ids,card_count,published) values('Nexus mythic fixture','Rollback only',array[mythic_id],5,true) returning id into mythic_booster;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,free}','100') where user_id=a;
 n:=public.kizuna_nexus('get','{}');xp:=(n->>'xp')::bigint;req:=gen_random_uuid();payload:=jsonb_build_object('count',1,'booster','staff:'||booster);
 r:=public.kizuna_economy('open',payload,req);t:=public.kizuna_economy('open',payload,req);n:=public.kizuna_nexus('get','{}');
 if (n->>'xp')::bigint<>xp+15 or (select count(*) from kizuna_private.kizuna_nexus_discoveries where user_id=a and card_id=common_id)<>1 or r#>'{result,cards}'<>t#>'{result,cards}' then raise exception 'First discovery/opening XP or draw replay wrong';end if;
 r:=public.kizuna_economy('recycle_all',jsonb_build_object('revision',t->'revision'),gen_random_uuid());
 r:=public.kizuna_economy('recycle',jsonb_build_object('cardId',common_id,'revision',r->'revision'),gen_random_uuid());
 r:=public.kizuna_economy('open',payload,gen_random_uuid());n:=public.kizuna_nexus('get','{}');
 if (n->>'xp')::bigint<>xp+25 then raise exception 'Reacquiring a sold/recycled discovery farmed XP';end if;
 xp:=(n->>'xp')::bigint;
 r:=public.kizuna_economy('open',jsonb_build_object('count',1,'booster','staff:'||mythic_booster),gen_random_uuid());
 select count(*) into mythic_levels from kizuna_private.kizuna_mythic_unlocks where user_id=a and card_id=mythic_id and unlocked_at is not null;
 n:=public.kizuna_nexus('get','{}');
 if (n->>'xp')::bigint<>xp+15+25*mythic_levels or jsonb_array_length(r#>'{result,resonance}')<>5 then raise exception 'Awakening XP or preserved resonance hook incorrect';end if;
 xp:=(n->>'xp')::bigint;perform public.kizuna_mythic('get');perform public.kizuna_nexus('get','{}');n:=public.kizuna_nexus('get','{}');
 if (n->>'xp')::bigint<>xp then raise exception 'Read operations awarded XP';end if;
 if (n->>'level')::integer<>1+floor(sqrt(xp/100.0))::integer or (n->>'nextLevelXp')::bigint<>power((n->>'level')::numeric,2)*100 then raise exception 'XP level thresholds incorrect';end if;

 -- A real server-validated collection mission awards once; mere visits do not.
 insert into public.kizuna_adventure_definitions(id,kind,title,requirements,reward_label,enabled) values('nexus-qa-'||suffix,'mission','Nexus rollback collection objective','{"metric":"total","goal":1}','Nexus QA badge',true);
 perform public.kizuna_adventure('claim',jsonb_build_object('id','nexus-qa-'||suffix));
 perform public.kizuna_adventure('claim',jsonb_build_object('id','nexus-qa-'||suffix));
 n:=public.kizuna_nexus('get','{}');
 if (n->>'xp')::bigint<>xp+20 then raise exception 'Collection mission XP not granted exactly once';end if;
 xp:=(n->>'xp')::bigint;
 perform public.kizuna_adventure('visit',jsonb_build_object('universe',(select card->>'series' from public.kizuna_cards where id=common_id)));
 n:=public.kizuna_nexus('get','{}');if (n->>'xp')::bigint<>xp then raise exception 'Visiting generated farmable XP';end if;
 insert into public.kizuna_adventure_definitions(id,kind,title,requirements,reward_label,enabled) values('nexus-visit-'||suffix,'mission','Nexus rollback visit objective','{"metric":"visits","goal":1}','Nexus QA visit badge',true);
 perform public.kizuna_adventure('claim',jsonb_build_object('id','nexus-visit-'||suffix));
 n:=public.kizuna_nexus('get','{}');if (n->>'xp')::bigint<>xp then raise exception 'Visit-only objective generated collection XP';end if;
 perform public.kizuna_anomalies('claim',jsonb_build_object('event',anomaly_id,'challenge','open-one'));
 perform public.kizuna_anomalies('claim',jsonb_build_object('event',anomaly_id,'challenge','open-one'));
 n:=public.kizuna_nexus('get','{}');
 if (n->>'xp')::bigint<>xp+30 then raise exception 'Anomaly XP not granted exactly once';end if;

 -- Neither account IDs, XP, prices nor role metadata supplied by a browser are authority.
 before_n:=n;perform set_config('request.jwt.claim.sub',b::text,true);r:=public.kizuna_economy('get');
 execute 'set local role authenticated';
 begin perform public.kizuna_nexus('get',jsonb_build_object('user_id',a,'xp',999999,'unlocked',before_n->'unlocked'));raise exception 'Read payload accepted forged identity/XP';
 exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;
 n:=public.kizuna_nexus('get','{}');
 if n->>'xp'<>'0' or n->'unlocked'<>'[]'::jsonb or n#>>'{preferences,frame}'<>'' then raise exception 'Cross-account Nexus state or client XP accepted';end if;
 begin update kizuna_private.kizuna_nexus_progress set xp=999999 where user_id=b;raise exception 'Browser wrote XP';exception when insufficient_privilege then null;end;
 begin insert into kizuna_private.kizuna_nexus_unlocks(user_id,node_id,cost,config_version) values(b,'prestige_1',0,1);raise exception 'Browser forged purchase';exception when insufficient_privilege then null;end;
 rejected:=false;begin perform public.kizuna_nexus('xp','{"amount":999999}');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Public XP setter exists';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',a::text,true);n:=public.kizuna_nexus('get','{}');
 if n->'unlocked'<>before_n->'unlocked' or n->>'xp'<>before_n->>'xp' then raise exception 'Account switch damaged previous progress';end if;
 if not exists(select 1 from kizuna_private.kizuna_economy_receipts where user_id=a and action='nexus_buy') then raise exception 'Nexus purchases missing economic receipts';end if;
 if (select count(*) from kizuna_private.kizuna_nexus_daily_claims where user_id=a)<>1 then raise exception 'More than one daily claim stored';end if;
end;$$;
rollback;
select 'nexus: purchases, receipts, five bonuses, XP, priorities, recycling carry, Paris DST and isolation passed; all fixtures rolled back' as result;
