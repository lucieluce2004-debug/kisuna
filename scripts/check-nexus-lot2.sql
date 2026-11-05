-- Nexus lot 2 after the base-10 recharge migration. All fixtures/configuration overrides are rolled back.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
 r jsonb; t jsonb; n jsonb; payload jsonb; before_state jsonb; test_request uuid;
 item record; uname text; uid uuid; table_name text; common_id text; mythic_id text; second_id text;
 booster_id uuid; weekly_id uuid; listing_id uuid; album_id text; priority_ids text[]; album_cards text[]; weekly_cards text[];
 day_key text:=to_char(now() at time zone 'Europe/Paris','YYYY-MM-DD'); week_key text;
 balance bigint; inv bigint; free_count integer; weekly_count integer; fragments bigint; xp bigint; revision bigint;
 old_time bigint; actual_count integer; rejected boolean; source_text text; test_config_version integer;
begin
 perform pg_advisory_xact_lock(17493,700);
 select nc.version into strict test_config_version from kizuna_private.kizuna_nexus_config nc where nc.id;
 if test_config_version<3 then raise exception 'Base-10 migration must be installed before this suite';end if;
 if has_function_privilege('anon','public.kizuna_nexus(text,jsonb)','execute')
    or not has_function_privilege('authenticated','public.kizuna_nexus(text,jsonb)','execute')
    or (select prosecdef from pg_proc where oid='public.kizuna_nexus(text,jsonb)'::regprocedure)
 then raise exception 'Nexus RPC permission/security mode regression';end if;
 if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='kizuna_private'
   and p.proname like 'nexus_%' and has_function_privilege('authenticated',p.oid,'execute')) then raise exception 'Privileged Nexus helper exposed';end if;
 insert into auth.users(id,email,is_anonymous) values
  (a,'nexus2-a-'||suffix||'@example.invalid',false),(b,'nexus2-b-'||suffix||'@example.invalid',false),(c,'nexus2-c-'||suffix||'@example.invalid',false);
 insert into public.kizuna_profiles(id,username) values(a,'Nexus2A_'||suffix),(b,'Nexus2B_'||suffix),(c,'Nexus2C_'||suffix);
 foreach uid in array array[a,b,c] loop
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform public.kizuna_economy('get');perform public.kizuna_nexus('get','{}');
 end loop;
 select id into strict common_id from public.kizuna_cards where card->>'rarity'='Commun' order by id limit 1;
 select c.id into strict mythic_id from public.kizuna_cards c join public.kizuna_mythic_forms f on f.card_id=c.id where c.card->>'rarity'='Mythique' order by c.id limit 1;
 select id into strict second_id from public.kizuna_cards where id not in(common_id,mythic_id) order by id limit 1;
 select array_agg(id order by id) into priority_ids from (select id from public.kizuna_cards order by id limit 21) x;
 if cardinality(priority_ids)<>21 then raise exception 'Test catalogue requires 21 cards';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);r:=public.kizuna_economy('get');n:=public.kizuna_nexus('get','{}');
 if (n->>'configVersion')::integer is distinct from test_config_version or jsonb_array_length(n->'nodes')<>25
    or (select count(*) from jsonb_array_elements(n->'nodes') x where (x->>'enabled')::boolean)<>25 then raise exception 'Current configuration must expose 25 working nodes';end if;
 if r#>>'{snapshot,chakra}' is distinct from '500' or r#>>'{snapshot,stock,free}' is distinct from '3'
    or n#>>'{bonuses,freeCapacity}' is distinct from '10' then raise exception 'Initial economy changed';end if;
 begin perform public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','invocation_1','configVersion',test_config_version,'expectedCost',1000),gen_random_uuid());raise exception 'Insufficient balance accepted';
 exception when raise_exception then if sqlerrm<>'INSUFFICIENT_CHAKRA' then raise;end if;end;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{chakra}','1000000') where user_id in(a,b,c);
 begin perform public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','invocation_1','configVersion',test_config_version-1,'expectedCost',1000),gen_random_uuid());raise exception 'Old version accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','invocation_1','configVersion',test_config_version,'expectedCost',1),gen_random_uuid());raise exception 'Forged price accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 select jsonb_build_object('nodeId',id,'configVersion',test_config_version,'expectedCost',cost) into payload from kizuna_private.kizuna_nexus_nodes where id='invocation_2';
 begin perform public.kizuna_economy('nexus_buy',payload,gen_random_uuid());raise exception 'Level gate bypassed';
 exception when raise_exception then if sqlerrm<>'NEXUS_LEVEL_REQUIRED' then raise;end if;end;
 update kizuna_private.kizuna_nexus_progress set xp=60000 where user_id in(a,b,c);
 begin perform public.kizuna_economy('nexus_buy',payload,gen_random_uuid());raise exception 'Prerequisite gate bypassed';
 exception when raise_exception then if sqlerrm<>'NEXUS_PREREQUISITE_REQUIRED' then raise;end if;end;

 -- Invocation: an existing daily claim cannot be multiplied by an upgrade.
 test_request:=gen_random_uuid();payload:=jsonb_build_object('nodeId','invocation_1','configVersion',test_config_version,'expectedCost',1000);
 r:=public.kizuna_economy('nexus_buy',payload,test_request);t:=public.kizuna_economy('nexus_buy',payload,test_request);
 if r#>>'{snapshot,chakra}'<>'999000' or t#>>'{snapshot,chakra}'<>r#>>'{snapshot,chakra}' or r#>>'{snapshot,stock,free}'<>'3' then raise exception 'Purchase replay or preserved free stock wrong';end if;
 inv:=(r#>>'{snapshot,stock,inv}')::bigint;r:=public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',day_key),gen_random_uuid());
 if (r#>>'{snapshot,stock,inv}')::bigint<>inv+1 then raise exception 'Invocation I daily is not one';end if;
 for item in select * from kizuna_private.kizuna_nexus_nodes where branch='invocation' and tier>1 order by tier loop
  r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',item.id,'configVersion',test_config_version,'expectedCost',item.cost),gen_random_uuid());
  if item.tier in(2,4) then
   actual_count:=case item.tier when 2 then 11 else 13 end;
   if (r#>>'{result,nexus,bonuses,freeCapacity}')::integer<>actual_count then raise exception 'Invocation capacity wrong';end if;
   old_time:=floor(extract(epoch from now())*1000)::bigint-21600000::bigint*3;
   update public.kizuna_player_states set snapshot=jsonb_set(jsonb_set(snapshot,'{stock,free}','10'),'{stock,t}',to_jsonb(old_time)) where user_id=a;
   r:=public.kizuna_economy('get');if (r#>>'{snapshot,stock,free}')::integer<>actual_count then raise exception 'Server recharge ignores Nexus capacity';end if;
  end if;
 end loop;
 if r#>>'{result,nexus,bonuses,dailyPacks}'<>'4' then raise exception 'Invocation V does not grant four daily packs';end if;
 begin perform public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',day_key),gen_random_uuid());raise exception 'Upgrade granted second daily claim';
 exception when raise_exception then if sqlerrm<>'NEXUS_DAILY_CLAIMED' then raise;end if;end;
 foreach uid in array array[b,c] loop
  perform set_config('request.jwt.claim.sub',uid::text,true);
  for item in select * from kizuna_private.kizuna_nexus_nodes where branch='invocation' and tier<=(case when uid=b then 3 else 5 end) order by tier loop
   r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',item.id,'configVersion',test_config_version,'expectedCost',item.cost),gen_random_uuid());
  end loop;
  inv:=(r#>>'{snapshot,stock,inv}')::bigint;r:=public.kizuna_economy('nexus_daily',jsonb_build_object('periodKey',day_key),gen_random_uuid());
  if (r#>>'{snapshot,stock,inv}')::bigint<>inv+(case when uid=b then 2 else 4 end) then raise exception 'Fresh daily amount incorrect after upgrade';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',a::text,true);

 -- Prestige: a weekly claim is unique across tier upgrades and the separate stock is authoritative.
 week_key:=kizuna_private.nexus_week_start(now())::text;
 if kizuna_private.nexus_week_start('2026-11-08 23:30+00'::timestamptz)<>date '2026-11-09'
    or kizuna_private.nexus_week_start('2026-11-08 22:30+00'::timestamptz)<>date '2026-11-02'
    or kizuna_private.nexus_next_week_reset('2026-03-23 00:00 Europe/Paris'::timestamptz)-'2026-03-23 00:00 Europe/Paris'::timestamptz<>interval '167 hours'
    or kizuna_private.nexus_next_week_reset('2026-10-19 00:00 Europe/Paris'::timestamptz)-'2026-10-19 00:00 Europe/Paris'::timestamptz<>interval '169 hours'
 then raise exception 'Paris week/DST boundary wrong';end if;
 begin perform public.kizuna_economy('nexus_reward',jsonb_build_object('key','weekly','periodKey',week_key),gen_random_uuid());raise exception 'Locked weekly reward accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_REWARD_LOCKED' then raise;end if;end;
 for item in select * from kizuna_private.kizuna_nexus_nodes where branch='prestige' and tier<=3 order by tier loop
  r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',item.id,'configVersion',test_config_version,'expectedCost',item.cost),gen_random_uuid());
 end loop;
 begin perform public.kizuna_economy('nexus_reward','{"key":"prestige_daily","periodKey":"2000-01-01"}',gen_random_uuid());raise exception 'Missed reward periods accumulated';
 exception when raise_exception then if sqlerrm<>'NEXUS_PERIOD_CHANGED' then raise;end if;end;
 balance:=(r#>>'{snapshot,chakra}')::bigint;test_request:=gen_random_uuid();payload:=jsonb_build_object('key','prestige_daily','periodKey',day_key);
 r:=public.kizuna_economy('nexus_reward',payload,test_request);t:=public.kizuna_economy('nexus_reward',payload,test_request);
 if (t#>>'{snapshot,chakra}')::bigint<>balance+25 then raise exception 'Prestige daily reward/replay incorrect';end if;
 begin perform public.kizuna_economy('nexus_reward',payload,gen_random_uuid());raise exception 'Prestige daily twice';
 exception when raise_exception then if sqlerrm<>'NEXUS_REWARD_CLAIMED' then raise;end if;end;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,nexusWeekly}','1000000') where user_id=a;
 begin perform public.kizuna_economy('nexus_reward',jsonb_build_object('key','weekly','periodKey',week_key),gen_random_uuid());raise exception 'Weekly stock overflow accepted';
 exception when raise_exception then if sqlerrm<>'BALANCE_LIMIT' then raise;end if;end;
 if exists(select 1 from kizuna_private.kizuna_nexus_reward_claims where user_id=a and reward_key='weekly') then raise exception 'Failed weekly delivery consumed claim';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,nexusWeekly}','0') where user_id=a;
 test_request:=gen_random_uuid();payload:=jsonb_build_object('key','weekly','periodKey',week_key);
 r:=public.kizuna_economy('nexus_reward',payload,test_request);t:=public.kizuna_economy('nexus_reward',payload,test_request);
 if t#>>'{snapshot,stock,nexusWeekly}'<>'1' then raise exception 'Prestige III weekly reward/replay incorrect';end if;
 select cost into balance from kizuna_private.kizuna_nexus_nodes where id='prestige_4';
 r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','prestige_4','configVersion',test_config_version,'expectedCost',balance),gen_random_uuid());
 begin perform public.kizuna_economy('nexus_reward',payload,gen_random_uuid());raise exception 'Upgrade granted another weekly reward';
 exception when raise_exception then if sqlerrm<>'NEXUS_REWARD_CLAIMED' then raise;end if;end;
 weekly_id:=kizuna_private.nexus_weekly_definition();
 select card_ids into weekly_cards from public.kizuna_boosters where id=weekly_id;
 if (select published from public.kizuna_boosters where id=weekly_id) then raise exception 'Weekly pool exposed as a public staff booster';end if;
 if (select cardinality(card_ids) from public.kizuna_boosters where id=weekly_id) not between 1 and 500
    or (select count(distinct c.card->>'rarity') from public.kizuna_boosters b cross join unnest(b.card_ids) x(id) join public.kizuna_cards c on c.id=x.id where b.id=weekly_id)<>6
 then raise exception 'Weekly booster pool is not a bounded real six-rarity pool';end if;
 -- Lot 3 protects the managed pool before an unbalanced definition can be stored.
 begin update public.kizuna_boosters set card_ids=array[mythic_id] where id=weekly_id;raise exception 'Managed weekly pool changed outside versioned publication';
 exception when raise_exception then if sqlerrm<>'NEXUS_WEEKLY_MANAGED' then raise;end if;end;
 if (select card_ids from public.kizuna_boosters where id=weekly_id) is distinct from weekly_cards then raise exception 'Rejected weekly pool edit was not atomic';end if;
 update kizuna_private.kizuna_nexus_config set weekly_enabled=false where id;
 begin perform kizuna_private.nexus_weekly_definition();raise exception 'Disabled weekly pool accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_WEEKLY_UNAVAILABLE' then raise;end if;end;
 update kizuna_private.kizuna_nexus_config set weekly_enabled=true where id;
 begin perform public.kizuna_economy('open',jsonb_build_object('count',1,'booster','staff:'||weekly_id),gen_random_uuid());raise exception 'Weekly pack opened via ordinary staff alias';
 exception when raise_exception then if sqlerrm<>'NEXUS_WEEKLY_REQUIRED' then raise;end if;end;
 insert into public.kizuna_boosters(name,description,card_ids,card_count,published) values('Nexus 2 draft fixture','Rollback only',array[common_id],5,false) returning id into booster_id;
 begin perform public.kizuna_economy('open',jsonb_build_object('count',1,'booster','staff:'||booster_id),gen_random_uuid());raise exception 'Ordinary unpublished booster opened';
 exception when raise_exception then if sqlerrm<>'BOOSTER_UNAVAILABLE' then raise;end if;end;
 r:=public.kizuna_economy('get');free_count:=(r#>>'{snapshot,stock,free}')::integer;inv:=(r#>>'{snapshot,stock,inv}')::bigint;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,pm}','249') where user_id=a;
 test_request:=gen_random_uuid();payload:='{"count":1,"booster":"nexus:weekly"}';
 r:=public.kizuna_economy('open',payload,test_request);t:=public.kizuna_economy('open',payload,test_request);
 if jsonb_array_length(r#>'{result,cards}')<>5 or r#>'{result,cards}'<>t#>'{result,cards}'
    or t#>>'{snapshot,stock,nexusWeekly}'<>'0' or (t#>>'{snapshot,stock,free}')::integer<>free_count or (t#>>'{snapshot,stock,inv}')::bigint<>inv
    or not exists(select 1 from jsonb_array_elements(r#>'{result,cards}') x where x->>'rarity'='Mythique')
    or not exists(select 1 from kizuna_private.kizuna_booster_journal where user_id=a and kizuna_booster_journal.request_id=test_request and packs=1)
 then raise exception 'Weekly opening bypassed real engine, pity, journal or stock isolation';end if;
 begin perform public.kizuna_economy('open',payload,gen_random_uuid());raise exception 'Weekly opening consumed ordinary stock';
 exception when raise_exception then if sqlerrm<>'INSUFFICIENT_WEEKLY_PACKS' then raise;end if;end;
 select cost into balance from kizuna_private.kizuna_nexus_nodes where id='prestige_5';
 r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId','prestige_5','configVersion',test_config_version,'expectedCost',balance),gen_random_uuid());
 balance:=(r#>>'{snapshot,chakra}')::bigint;inv:=(r#>>'{snapshot,stock,inv}')::bigint;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,inv}','1000000') where user_id=a;
 begin perform public.kizuna_economy('nexus_reward','{"key":"prestige_once","periodKey":"once"}',gen_random_uuid());raise exception 'Prestige reward stock overflow accepted';
 exception when raise_exception then if sqlerrm<>'BALANCE_LIMIT' then raise;end if;end;
 if exists(select 1 from kizuna_private.kizuna_nexus_reward_claims where user_id=a and reward_key='prestige_once') then raise exception 'Failed prestige reward consumed claim';end if;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{stock,inv}',to_jsonb(inv)) where user_id=a;
 test_request:=gen_random_uuid();r:=public.kizuna_economy('nexus_reward','{"key":"prestige_once","periodKey":"once"}',test_request);t:=public.kizuna_economy('nexus_reward','{"key":"prestige_once","periodKey":"once"}',test_request);
 if (t#>>'{snapshot,chakra}')::bigint<>balance+1000 or (t#>>'{snapshot,stock,inv}')::bigint<>inv+5 then raise exception 'Prestige unique reward/replay incorrect';end if;
 begin perform public.kizuna_economy('nexus_reward','{"key":"prestige_once","periodKey":"once"}',gen_random_uuid());raise exception 'Prestige unique reward twice';
 exception when raise_exception then if sqlerrm<>'NEXUS_REWARD_CLAIMED' then raise;end if;end;

 -- Buy remaining branches through their real level/price/prerequisite checks.
 for item in select * from kizuna_private.kizuna_nexus_nodes where branch in('destin','resonance','collection') order by branch,tier loop
  r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',item.id,'configVersion',test_config_version,'expectedCost',item.cost),gen_random_uuid());
 end loop;
 n:=public.kizuna_nexus('get','{}');
 if not (n->'stats') ?& array['packs','cards','newCards','rarities','pity','odds'] then raise exception 'Detailed statistics response incomplete';end if;
 if jsonb_array_length(n->'unlocked')<>25 or n#>>'{bonuses,prioritySlots}'<>'20' or n#>>'{bonuses,recycleBps}'<>'1500'
    or n#>>'{bonuses,prestigeTitle}'<>'Légende KIZUNA' or n#>>'{bonuses,profileAnimation}'<>'true' or n#>>'{bonuses,prestigeCrystal}'<>'true'
    or n#>>'{bonuses,resonanceAnimation}'<>'true' or n#>>'{bonuses,mythicPrestige}'<>'true' then raise exception 'Completed tree benefits incorrect';end if;
 r:=public.kizuna_economy('preferences',jsonb_build_object('wishlist',array[priority_ids[21]]),gen_random_uuid());
 r:=public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',priority_ids[1:20],'archivePreferences',jsonb_build_object('series','','rarity','','mode','duplicates','sort','copies')),gen_random_uuid());
 if jsonb_array_length(r#>'{result,nexus,preferences,priorityCardIds}')<>20 or not(r#>'{snapshot,market,wishlist}') ?& priority_ids then raise exception 'Twenty priorities erased existing wishlist';end if;
 begin perform public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',priority_ids),gen_random_uuid());raise exception 'Twenty-one priorities accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_PRIORITY_LIMIT' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_preferences','{"archivePreferences":{"series":"","rarity":"","mode":"invalid","sort":"copies"}}',gen_random_uuid());raise exception 'Invalid archive mode accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise;end if;end;
 if r#>>'{result,nexus,preferences,archivePreferences,mode}'<>'duplicates' then raise exception 'Archive preference not persisted';end if;

 -- 15% recycling uses aggregate arithmetic and preserves fractions; unique copies stay unboosted.
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',jsonb_build_array(jsonb_build_object('id',common_id,'at',1),jsonb_build_object('id',common_id,'at',2),jsonb_build_object('id',common_id,'at',3))) where user_id=a;
 r:=public.kizuna_economy('get');balance:=(r#>>'{snapshot,chakra}')::bigint;
 test_request:=gen_random_uuid();payload:=jsonb_build_object('revision',r->'revision');r:=public.kizuna_economy('recycle_all',payload,test_request);t:=public.kizuna_economy('recycle_all',payload,test_request);
 if (t#>>'{snapshot,chakra}')::bigint<>balance+11 or t#>>'{result,nexus,recycleRemainder}'<>'5000' or jsonb_array_length(t#>'{snapshot,owned}')<>1 then raise exception '15 percent aggregate bonus/carry/replay wrong';end if;
 r:=public.kizuna_economy('recycle',jsonb_build_object('cardId',common_id,'revision',t->'revision'),gen_random_uuid());
 if r#>>'{result,bonus}'<>'0' or r#>>'{result,nexus,recycleRemainder}'<>'5000' then raise exception 'Unique copy received bonus';end if;

 -- Album proof uses a frozen set and recognizes cards currently held in market escrow.
 album_id:='qa-'||suffix;
 select array[common_id,mythic_id]||array_agg(id order by id) into album_cards from(select id from public.kizuna_cards where id not in(common_id,mythic_id) order by id limit 3) x;
 insert into kizuna_private.kizuna_nexus_album_rewards(id,name,card_ids,chakra,packs,enabled) values(album_id,'Nexus rollback album',album_cards,100,1,true);
 begin perform public.kizuna_economy('nexus_reward',jsonb_build_object('key','album:'||album_id,'periodKey','once'),gen_random_uuid());raise exception 'Incomplete album claimed';
 exception when raise_exception then if sqlerrm<>'NEXUS_ALBUM_INCOMPLETE' then raise;end if;end;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',(select jsonb_agg(jsonb_build_object('id',id,'at',4)) from unnest(album_cards) x(id))) where user_id=a;
 r:=public.kizuna_economy('publish',jsonb_build_object('cardId',common_id,'mode','sale','hours',24,'price',100),gen_random_uuid());listing_id:=(r#>>'{result,listingId}')::uuid;
 balance:=(r#>>'{snapshot,chakra}')::bigint;inv:=(r#>>'{snapshot,stock,inv}')::bigint;test_request:=gen_random_uuid();payload:=jsonb_build_object('key','album:'||album_id,'periodKey','once');
 r:=public.kizuna_economy('nexus_reward',payload,test_request);t:=public.kizuna_economy('nexus_reward',payload,test_request);
 if (t#>>'{snapshot,chakra}')::bigint<>balance+100 or (t#>>'{snapshot,stock,inv}')::bigint<>inv+1 then raise exception 'Album reward or escrow proof incorrect';end if;
 begin perform public.kizuna_economy('nexus_reward',payload,gen_random_uuid());raise exception 'Album reward claimed twice';
 exception when raise_exception then if sqlerrm<>'NEXUS_REWARD_CLAIMED' then raise;end if;end;
 r:=public.kizuna_economy('cancel',jsonb_build_object('id',listing_id),gen_random_uuid());

 -- Real Mythic duplicate journal events award bounded cosmetic fragments, never a fourth awakening.
 insert into public.kizuna_boosters(name,description,card_ids,card_count,published) values('Nexus 2 Mythic fixture','Rollback only',array[mythic_id],5,true) returning id into booster_id;
 perform public.kizuna_adventure('get');
 update kizuna_private.kizuna_adventure_players set state=jsonb_set(state,'{fragments}','0') where user_id=a;
 r:=public.kizuna_economy('open',jsonb_build_object('count',1,'booster','staff:'||booster_id),gen_random_uuid());
 if (select coalesce((state->>'fragments')::bigint,0) from kizuna_private.kizuna_adventure_players where user_id=a)<>10 then raise exception 'Resonance IV should grant two fragments per duplicate capped at ten/day';end if;
 r:=public.kizuna_economy('open',jsonb_build_object('count',1,'booster','staff:'||booster_id),gen_random_uuid());
 if (select (state->>'fragments')::bigint from kizuna_private.kizuna_adventure_players where user_id=a)<>10 then raise exception 'Duplicate fragments exceeded daily cap';end if;
 n:=public.kizuna_nexus('get','{}');t:=public.kizuna_nexus('get','{}');
 if (select (state->>'fragments')::bigint from kizuna_private.kizuna_adventure_players where user_id=a)<>10
    or exists(select 1 from kizuna_private.kizuna_mythic_unlocks where user_id=a and level>3) then raise exception 'Reads farmed fragments or fourth awakening created';end if;
 if (select sum(amount) from kizuna_private.kizuna_nexus_fragment_events where user_id=a and period_key=day_key::date)<>10 then raise exception 'Fragment ledger does not match the Paris daily cap';end if;
 begin perform public.kizuna_economy('nexus_cosmetic',jsonb_build_object('id','echo','expectedCost',1,'configVersion',test_config_version),gen_random_uuid());raise exception 'Client chose cosmetic price';
 exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_cosmetic',jsonb_build_object('id','echo','expectedCost',20,'configVersion',test_config_version-1),gen_random_uuid());raise exception 'Old cosmetic configuration accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_CONFIG_CHANGED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_cosmetic',jsonb_build_object('id','echo','expectedCost',20,'configVersion',test_config_version),gen_random_uuid());raise exception 'Insufficient fragments accepted';
 exception when raise_exception then if sqlerrm<>'INSUFFICIENT_FRAGMENTS' then raise;end if;end;
 update kizuna_private.kizuna_adventure_players set state=jsonb_set(state,'{fragments}','200') where user_id=a;
 foreach uname in array array['echo','astral','transcendance'] loop
  balance:=case uname when 'echo' then 20 when 'astral' then 50 else 100 end;test_request:=gen_random_uuid();payload:=jsonb_build_object('id',uname,'expectedCost',balance,'configVersion',test_config_version);
  r:=public.kizuna_economy('nexus_cosmetic',payload,test_request);t:=public.kizuna_economy('nexus_cosmetic',payload,test_request);
 end loop;
 if (select (state->>'fragments')::bigint from kizuna_private.kizuna_adventure_players where user_id=a)<>30 or (select count(*) from kizuna_private.kizuna_nexus_cosmetic_unlocks where user_id=a)<>3 then raise exception 'Cosmetics charged twice or wrong shared fragment balance';end if;
 begin perform public.kizuna_economy('nexus_cosmetic',jsonb_build_object('id','echo','expectedCost',20,'configVersion',test_config_version),gen_random_uuid());raise exception 'Cosmetic charged twice';
 exception when raise_exception then if sqlerrm<>'NEXUS_COSMETIC_OWNED' then raise;end if;end;
 r:=public.kizuna_economy('nexus_preferences','{"aura":"transcendance","frame":"nexus"}',gen_random_uuid());
 if r#>>'{result,nexus,preferences,aura}'<>'transcendance' then raise exception 'Owned aura not equipped';end if;
 n:=public.kizuna_nexus('get','{}');
 if (n#>>'{stats,packs}')::bigint<>(select coalesce(sum(packs),0) from kizuna_private.kizuna_booster_journal where user_id=a)
    or (n#>>'{stats,cards}')::bigint<>(select count(*) from kizuna_private.kizuna_draw_journal where user_id=a)
    or n->'advancedTracking'='null'::jsonb or n->'marketWatch'='null'::jsonb then raise exception 'Detailed statistics/tracking are not backed by actual journals';end if;

 -- Intermediate bonuses remain meaningful before completing a branch.
 perform set_config('request.jwt.claim.sub',b::text,true);
 for item in select * from kizuna_private.kizuna_nexus_nodes where (branch='destin' and tier<=3) or (branch='collection' and tier<=3) or (branch='resonance' and tier<=2) order by branch,tier loop
  r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',item.id,'configVersion',test_config_version,'expectedCost',item.cost),gen_random_uuid());
 end loop;
 if r#>>'{result,nexus,bonuses,prioritySlots}'<>'15' or r#>>'{result,nexus,bonuses,recycleBps}'<>'1000' or r#>>'{result,nexus,bonuses,fragmentsPerDuplicate}'<>'1' then raise exception 'Intermediate branch effects incorrect';end if;
 r:=public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',priority_ids[1:15]),gen_random_uuid());
 begin perform public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',priority_ids[1:16]),gen_random_uuid());raise exception 'Sixteenth priority accepted before Destin V';
 exception when raise_exception then if sqlerrm not in('NEXUS_PRIORITY_LIMIT','NEXUS_PRIORITY_LOCKED') then raise;end if;end;
 update public.kizuna_player_states set snapshot=jsonb_set(snapshot,'{owned}',jsonb_build_array(jsonb_build_object('id',common_id,'at',1),jsonb_build_object('id',common_id,'at',2),jsonb_build_object('id',common_id,'at',3))) where user_id=b;
 r:=public.kizuna_economy('get');balance:=(r#>>'{snapshot,chakra}')::bigint;
 r:=public.kizuna_economy('recycle_all',jsonb_build_object('revision',r->'revision'),gen_random_uuid());
 if (r#>>'{snapshot,chakra}')::bigint<>balance+11 or r#>>'{result,nexus,recycleRemainder}'<>'0' then raise exception '10 percent recycling incorrect';end if;
 perform public.kizuna_adventure('get');
 perform set_config('request.jwt.claim.sub',a::text,true);
 r:=public.kizuna_economy('publish',jsonb_build_object('cardId',mythic_id,'mode','sale','hours',24,'price',100),gen_random_uuid());listing_id:=(r#>>'{result,listingId}')::uuid;
 perform set_config('request.jwt.claim.sub',b::text,true);
 fragments:=(select coalesce((state->>'fragments')::bigint,0) from kizuna_private.kizuna_adventure_players where user_id=b);
 r:=public.kizuna_economy('buy',jsonb_build_object('id',listing_id),gen_random_uuid());
 if (select coalesce((state->>'fragments')::bigint,0) from kizuna_private.kizuna_adventure_players where user_id=b)<>fragments then raise exception 'Market purchase granted duplicate fragments';end if;
 test_request:=gen_random_uuid();payload:=jsonb_build_object('count',1,'booster','staff:'||booster_id);
 r:=public.kizuna_economy('open',payload,test_request);t:=public.kizuna_economy('open',payload,test_request);
 if (select coalesce((state->>'fragments')::bigint,0) from kizuna_private.kizuna_adventure_players where user_id=b)<>fragments+5 then raise exception 'Basic duplicate fragments or replay incorrect';end if;
 r:=public.kizuna_economy('publish',jsonb_build_object('cardId',common_id,'mode','sale','hours',24,'price',100),gen_random_uuid());listing_id:=(r#>>'{result,listingId}')::uuid;
 perform set_config('request.jwt.claim.sub',a::text,true);
 r:=public.kizuna_economy('nexus_preferences',jsonb_build_object('priorityCardIds',array[common_id]),gen_random_uuid());n:=public.kizuna_nexus('get','{}');
 if not exists(select 1 from jsonb_array_elements(n#>'{marketWatch,listings}') x where x->>'id'=listing_id::text) then raise exception 'Market watch omitted actual matching offer';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.kizuna_economy('cancel',jsonb_build_object('id',listing_id),gen_random_uuid());
 perform set_config('request.jwt.claim.sub',a::text,true);n:=public.kizuna_nexus('get','{}');
 if exists(select 1 from jsonb_array_elements(n#>'{marketWatch,listings}') x where x->>'id'=listing_id::text) then raise exception 'Market watch retained unavailable offer';end if;
 perform set_config('request.jwt.claim.sub',c::text,true);
 for item in select * from kizuna_private.kizuna_nexus_nodes where branch='prestige' order by tier loop
  r:=public.kizuna_economy('nexus_buy',jsonb_build_object('nodeId',item.id,'configVersion',test_config_version,'expectedCost',item.cost),gen_random_uuid());
 end loop;
 r:=public.kizuna_economy('nexus_reward',jsonb_build_object('key','weekly','periodKey',week_key),gen_random_uuid());
 if r#>>'{snapshot,stock,nexusWeekly}'<>'2' then raise exception 'Prestige IV weekly reward is not two';end if;
 -- Isolation and safe optional fields: a player without the relevant branches cannot equip them.
 begin perform public.kizuna_economy('nexus_preferences','{"aura":"echo"}',gen_random_uuid());raise exception 'Other player cosmetic equipped';
 exception when raise_exception then if sqlerrm<>'NEXUS_AURA_LOCKED' then raise;end if;end;
 begin perform public.kizuna_economy('nexus_preferences','{"archivePreferences":{"series":"","rarity":"","mode":"all","sort":"name"}}',gen_random_uuid());raise exception 'Locked archive feature accepted';
 exception when raise_exception then if sqlerrm<>'NEXUS_ARCHIVE_LOCKED' then raise;end if;end;
 n:=public.kizuna_nexus('get','{}');if n->'stats' is distinct from 'null'::jsonb or n->'marketWatch' is distinct from 'null'::jsonb then raise exception 'Locked advanced views exposed';end if;
 foreach table_name in array array['kizuna_nexus_reward_claims','kizuna_nexus_album_rewards','kizuna_nexus_cosmetics','kizuna_nexus_cosmetic_unlocks','kizuna_nexus_fragment_events'] loop
  if has_table_privilege('authenticated','kizuna_private.'||table_name,'select,insert,update,delete') or has_table_privilege('anon','kizuna_private.'||table_name,'select,insert,update,delete')
     or not(select relrowsecurity from pg_class where oid=('kizuna_private.'||table_name)::regclass) then raise exception 'Lot2 private table exposed: %',table_name;end if;
 end loop;
 execute 'set local role authenticated';
 begin update kizuna_private.kizuna_nexus_progress set xp=999999 where user_id=b;raise exception 'Player wrote server XP';exception when insufficient_privilege then null;end;
 begin insert into kizuna_private.kizuna_nexus_reward_claims(user_id,reward_key,period_key,result) values(b,'weekly',week_key,'{}');raise exception 'Player forged claim';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.kizuna_nexus('get','{}');raise exception 'Anonymous Nexus access';exception when insufficient_privilege then null;end;
end;$$;
rollback;
select 'nexus lot2: current configuration, purchases, base-10 capacity, rewards, weekly engine, recycling, albums, cosmetics, stats and isolation passed; fixtures rolled back' as result;
