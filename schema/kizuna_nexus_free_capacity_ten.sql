-- User-requested recharge capacity: 10 base packs, with the existing Nexus +1/+2.
-- Apply once after Nexus lot 3. This changes future recharge, never stored stock.
select pg_advisory_xact_lock(17493,700);
do $$begin
 if (select c.version from kizuna_private.kizuna_nexus_config c where c.id)<>2 then raise exception 'NEXUS_CAPACITY_TEN_VERSION';end if;
end; $$;
create table kizuna_private.kizuna_nexus_capacity_ten_backup(
 id boolean primary key default true check(id),captured_at timestamptz not null default now(),functions jsonb not null,
 states jsonb not null,configuration jsonb not null,admin_draft jsonb not null
);
alter table kizuna_private.kizuna_nexus_capacity_ten_backup enable row level security;
revoke all on kizuna_private.kizuna_nexus_capacity_ten_backup from public,anon,authenticated;
grant all on kizuna_private.kizuna_nexus_capacity_ten_backup to service_role;
create policy nexus_service_access on kizuna_private.kizuna_nexus_capacity_ten_backup for all to service_role using(true) with check(true);
insert into kizuna_private.kizuna_nexus_capacity_ten_backup(functions,states,configuration,admin_draft)
select (select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='kizuna_private' and p.proname in('nexus_bonuses','nexus_admin_preview','nexus_admin_node_details')),
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.kizuna_player_states s),
 jsonb_build_object('config',(select to_jsonb(c) from kizuna_private.kizuna_nexus_config c where c.id),'document',kizuna_private.nexus_admin_document(),
 'nodes',(select jsonb_agg(to_jsonb(n)) from kizuna_private.kizuna_nexus_nodes n)),
 (select to_jsonb(d) from kizuna_private.kizuna_nexus_admin_draft d where d.id);

do $$declare definition text;begin
 definition:=pg_get_functiondef('kizuna_private.nexus_bonuses(uuid)'::regprocedure);
 definition:=kizuna_private.nexus_lot_two_patch_once(definition,'''freeCapacity'',100+storage','''freeCapacity'',10+storage');
 execute definition;
 definition:=pg_get_functiondef('kizuna_private.nexus_admin_preview(jsonb,bigint,integer)'::regprocedure);
 definition:=kizuna_private.nexus_lot_two_patch_once(definition,'''freeCapacity'',100+kizuna_private.nexus_admin_sum','''freeCapacity'',10+kizuna_private.nexus_admin_sum');
 execute definition;
 definition:=pg_get_functiondef('kizuna_private.nexus_admin_node_details(text,jsonb)'::regprocedure);
 definition:=kizuna_private.nexus_lot_two_patch_once(definition,'(100+amount)','(10+amount)');
 execute definition;
end; $$;

-- Publish the engine-bound change as version 3 so stale purchase confirmations fail.
-- Restore restores an economic document, not old server code: the base remains ten.
-- A concurrently prepared draft is retained, with its own revision after publication.
do $$declare d kizuna_private.kizuna_nexus_admin_draft;live_document jsonb;publication_revision bigint;dirty boolean;details jsonb;n record;summary jsonb;begin
 select * into strict d from kizuna_private.kizuna_nexus_admin_draft x where x.id for update;
 live_document:=kizuna_private.nexus_admin_document();dirty:=d.draft is distinct from live_document;publication_revision:=d.revision+1;
 update kizuna_private.kizuna_nexus_config c set version=3,activated_at=now() where c.id;
 for n in select id from kizuna_private.kizuna_nexus_nodes where id in('invocation_2','invocation_4') loop
  details:=kizuna_private.nexus_admin_node_details(n.id,live_document->'economy');
  update kizuna_private.kizuna_nexus_nodes x set description=details->>'description',effect=details->'effect' where x.id=n.id;
 end loop;
 summary:=(kizuna_private.nexus_admin_preview(live_document,publication_revision,3)->'summary')||jsonb_build_object('reason','user_requested_base_capacity_10','baseCapacity',10,'previousBaseCapacity',100);
 insert into kizuna_private.kizuna_nexus_admin_history(version,revision,config,actor,action,summary) values(3,publication_revision,live_document,null,'publish',summary);
 update kizuna_private.kizuna_nexus_admin_draft x set revision=publication_revision+case when dirty then 1 else 0 end,published_revision=publication_revision,updated_at=now()
 where x.id;
 insert into private.kizuna_staff_audit(actor_id,action,details) values(null,'nexus_capacity_base_10',jsonb_build_object('previousVersion',2,'version',3,'previousBaseCapacity',100,'baseCapacity',10,'draftPreserved',true));
end; $$;
notify pgrst,'reload schema';
