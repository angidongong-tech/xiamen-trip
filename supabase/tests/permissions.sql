-- Run after bootstrap-local.sql and setup.sql in a disposable local database.
begin;
create function pg_temp.check_that(ok boolean, detail text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'assertion failed: %',detail; end if;end $$;
create function pg_temp.deny(stmt text,expected text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'Expected denial: %',stmt;
exception when others then
  if sqlstate<>expected then raise; end if;
end $$;
select pg_temp.check_that(public.xm_capabilities()->>'enabled'='false','default gate closed');
update xm_private.launch set enabled=true where singleton;
insert into auth.users values
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
set local role anon;
select pg_temp.deny('select public.xm_list()','42501');
select pg_temp.deny('select * from public.xm_records','42501');
select pg_temp.deny('select * from public.xm_invites','42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.xm_profile('Test A');
select public.xm_create('Fixture room A') as trip \gset
select public.xm_invite(:'trip','editor')->>'token' as editor_token \gset
select public.xm_invite(:'trip','viewer')->>'token' as viewer_token \gset
select public.xm_invite(:'trip','editor')->>'token' as older_token \gset
select public.xm_invite(:'trip','viewer') as revoked \gset
select public.xm_revoke_invite(:'trip',(:'revoked'::jsonb->>'id')::uuid);
select public.xm_invite(:'trip','viewer') as expired \gset
reset role;
update public.xm_invites set created_at=now()-interval '3 days',expires_at=now()-interval '2 days' where id=(:'expired'::jsonb->>'id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.deny(format('select public.xm_snapshot(%L)',:'trip'),'42501');
select pg_temp.check_that((select count(*)=0 from public.xm_signals where trip_id=:'trip'),'outsider gets no signal');
select pg_temp.check_that((select count(*)=0 from public.xm_members where trip_id=:'trip'),'outsider cannot see members');
select pg_temp.deny('select public.xm_join(''invalid'')','22023');
select pg_temp.deny(format('select public.xm_join(%L)',:'revoked'::jsonb->>'token'),'22023');
select pg_temp.deny(format('select public.xm_join(%L)',:'expired'::jsonb->>'token'),'22023');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.xm_profile('Test B');
select pg_temp.check_that(public.xm_join(:'editor_token')=:'trip'::uuid,'B joins as editor');
select pg_temp.deny(format('select public.xm_join(%L)',:'editor_token'),'22023');
select pg_temp.deny(format('select public.xm_member(%L,%L,%L)',:'trip','00000000-0000-4000-8000-000000000002','owner'),'42501');
select pg_temp.deny(format('update public.xm_members set role=''owner'' where trip_id=%L',:'trip'),'42501');
select pg_temp.deny('insert into public.xm_members(trip_id,user_id,role) values(gen_random_uuid(),auth.uid(),''owner'')','42501');
select pg_temp.check_that((select count(*)=1 from public.xm_signals where trip_id=:'trip'),'member gets signal');
select public.xm_create('Fixture room B') as other \gset

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select public.xm_join(:'viewer_token');
select pg_temp.check_that(public.xm_snapshot(:'trip')->'trip'->>'role'='viewer','viewer can read');
select pg_temp.deny(format('select public.xm_snapshot(%L)',:'other'),'42501');
select pg_temp.deny(format('select public.xm_apply(%L,gen_random_uuid(),''expense'',''e1'',0,null)',:'trip'),'42501');
select pg_temp.deny(format('select public.xm_apply(%L,gen_random_uuid(),''expense'',''e1'',1,null)',:'trip'),'42501');
select pg_temp.deny(format('select public.xm_import(%L,gen_random_uuid(),''[]'')',:'trip'),'42501');
select pg_temp.deny('delete from public.xm_records','42501');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select '{"date":"2026-11-29","cents":3150,"category":"打车","title":"Fixture receipt","notes":"","shared":true,"payer":"","payer_id":null}'::jsonb as expense \gset
select gen_random_uuid() as op \gset
select pg_temp.check_that(public.xm_apply(:'trip',:'op','expense','e1',0,:'expense')->>'status'='applied','A writes expense');
select pg_temp.check_that(public.xm_apply(:'trip',:'op','expense','e1',0,:'expense')->'record'->>'version'='1','idempotent retry');
select pg_temp.deny(format('select public.xm_apply(%L,%L,''expense'',''changed-op'',0,%L)',:'trip',:'op',:'expense'),'22023');
select pg_temp.check_that(public.xm_apply(:'trip',gen_random_uuid(),'checkin','places:bashi',0,'{"status":"done"}')->>'status'='applied','checkin');
select pg_temp.check_that(public.xm_apply(:'trip',gen_random_uuid(),'itinerary','order',0,'{"order":["coast","jimei","gulangyu"]}')->>'status'='applied','swap');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.check_that(exists(select 1 from jsonb_array_elements(public.xm_snapshot(:'trip')->'records') r
 where r->>'kind'='checkin' and r->'body'->>'status'='done' and r->>'actor'='00000000-0000-4000-8000-000000000001'),'B sees actor and status');
select pg_temp.check_that(exists(select 1 from jsonb_array_elements(public.xm_snapshot(:'trip')->'records') r
 where r->>'kind'='itinerary' and r->'body'->'order'->>0='coast'),'B sees swap');
select pg_temp.check_that(public.xm_apply(:'trip',gen_random_uuid(),'expense','e1',0,:'expense')->>'status'='conflict','stale update reports conflict');
select pg_temp.check_that(public.xm_apply(:'trip',gen_random_uuid(),'expense','e2',0,jsonb_set(:'expense','{cents}','1460'))->>'status'='applied','B writes distinct expense');
select pg_temp.check_that((select count(*)=2 from jsonb_array_elements(public.xm_snapshot(:'trip')->'records') r where r->>'kind'='expense'),'both expenses retained');
select pg_temp.check_that(public.xm_apply(:'trip',gen_random_uuid(),'expense','e2',1,null)->'record'->'body'='null'::jsonb,'soft delete');

select jsonb_build_array(
  jsonb_build_object('kind','expense','record_id','legacy-a','body',jsonb_set(:'expense','{cents}','10001')),
  jsonb_build_object('kind','expense','record_id','legacy-b','body',jsonb_set(:'expense','{cents}','10001')),
  jsonb_build_object('kind','setting','record_id','budget','body','{"cents":500000}'::jsonb)) as backup \gset
select gen_random_uuid() as batch \gset
select public.xm_import(:'trip',:'batch',:'backup') as outcome \gset
select pg_temp.check_that(:'outcome'::jsonb->>'expenses_added'='2' and :'outcome'::jsonb->>'cents_added'='20002','migration preserves matching receipts in the same backup');
select pg_temp.check_that(public.xm_import(:'trip',:'batch',:'backup')=:'outcome'::jsonb,'batch retry is idempotent');
select public.xm_import(:'trip',gen_random_uuid(),:'backup') as again \gset
select pg_temp.check_that(:'again'::jsonb->>'expenses_added'='0' and :'again'::jsonb->>'expenses_matched'='2','explicit reimport matches stable IDs');
select pg_temp.check_that((select count(*)=0 from jsonb_array_elements(public.xm_snapshot(:'other')->'records')),'separate rooms');
select pg_temp.deny(format('select public.xm_import(%L,gen_random_uuid(),%L)',:'trip',
  (:'backup'::jsonb||'[{"kind":"expense","record_id":"invalid","body":{}}]'::jsonb)::text),'22023');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.xm_member(:'trip','00000000-0000-4000-8000-000000000002',null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.deny(format('select public.xm_snapshot(%L)',:'trip'),'42501');
select pg_temp.check_that((select count(*)=0 from public.xm_signals where trip_id=:'trip'),'removed member cannot subscribe to room signals');
select pg_temp.check_that((select count(*)=1 from public.xm_members where trip_id=:'trip' and not active),'own revocation row');
select pg_temp.deny(format('select public.xm_join(%L)',:'older_token'),'22023');
reset role;
rollback;
select 'permissions, invites, imports and records: passed' as result;
