begin;
-- Synthetic fixtures only; rollback leaves no credentials or records.
insert into auth.users(id,email,raw_user_meta_data) values
 ('e0000000-0000-4000-8000-000000000001','health-a@example.invalid','{"display_name":"Health A"}'),
 ('e0000000-0000-4000-8000-000000000002','health-b@example.invalid','{"display_name":"Health B"}');
create function pg_temp.check_ok(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Health sync assertion: %',label; end if; end $$;
create function pg_temp.expect_error(stmt text,wanted text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute stmt; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 if actual is distinct from wanted then raise exception 'Expected %, got %',wanted,actual; end if;
end $$;
select pg_temp.check_ok((select relrowsecurity from pg_class where oid='health_sync_private.tokens'::regclass),'RLS enabled');
select pg_temp.check_ok(not has_table_privilege('authenticated','health_sync_private.tokens','SELECT'),'no table read');
select pg_temp.check_ok(not has_table_privilege('service_role','health_sync_private.tokens','SELECT'),'service only RPC');
select pg_temp.check_ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 n.nspname='public' and p.proname like 'health_sync_%' and p.prosecdef),'wrappers invoker');
select pg_temp.check_ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 n.nspname='health_sync_private' and p.proconfig is distinct from array['search_path=""']::text[]),'empty search_path');

set local role anon;
select pg_temp.expect_error('select public.health_sync_issue_token()','42501');
select pg_temp.expect_error('select public.health_sync_status()','42501');
select pg_temp.expect_error('select public.health_sync_revoke_token()','42501');
select pg_temp.expect_error('select public.health_sync_import(null,null)','42501');
reset role;

select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select pg_temp.expect_error('select public.health_sync_issue_token()','42501');
select pg_temp.expect_error('select public.health_sync_status()','42501');
select pg_temp.expect_error('select public.health_sync_revoke_token()','42501');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
select pg_temp.check_ok(public.health_sync_status()->>'enabled'='false','initial disconnected');
select set_config('health_test.token_a',public.health_sync_issue_token()->>'token',true);
select pg_temp.check_ok(length(current_setting('health_test.token_a'))=64,'256bit token');
select pg_temp.check_ok(public.health_sync_status()->>'enabled'='true','connected');
select pg_temp.check_ok(not(public.health_sync_status() ? 'token') and not(public.health_sync_status() ? 'token_hash'),'safe status');
select pg_temp.expect_error('select * from health_sync_private.tokens','42501');
select pg_temp.expect_error('select public.health_sync_import(null,null)','42501');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(public.health_sync_status()->>'enabled'='false','owner isolation');
select set_config('health_test.token_b',public.health_sync_issue_token()->>'token',true);
reset role;
select pg_temp.check_ok((select token_hash=encode(extensions.digest(current_setting('health_test.token_a'),'sha256'),'hex') from health_sync_private.tokens where user_id='e0000000-0000-4000-8000-000000000001'),'hash only');
select set_config('health_test.hash_a',encode(extensions.digest(current_setting('health_test.token_a'),'sha256'),'hex'),true);
select set_config('health_test.hash_b',encode(extensions.digest(current_setting('health_test.token_b'),'sha256'),'hex'),true);

set local role service_role;
select pg_temp.expect_error('select public.health_sync_issue_token()','42501');
select pg_temp.expect_error('select public.health_sync_import(repeat(''0'',64),''[]'')','28000');
select pg_temp.check_ok(public.health_sync_import(current_setting('health_test.hash_a'),
 '[{"date":"2020-01-01","weight_kg":70.24,"body_fat_pct":15.46},{"date":"2020-01-02","weight_kg":20}]')
 = '{"inserted":2,"updated":0,"skipped":0}'::jsonb,'initial import counts');
select pg_temp.check_ok(public.health_sync_import(current_setting('health_test.hash_a'),
 '[{"date":"2020-01-01","weight_kg":80,"body_fat_pct":20}]')
 = '{"inserted":0,"updated":0,"skipped":1}'::jsonb,'keep repeat counts');
select pg_temp.check_ok(public.health_sync_import(current_setting('health_test.hash_a'),
 '[{"date":"2020-01-01","weight_kg":71}]','overwrite')
 = '{"inserted":0,"updated":1,"skipped":0}'::jsonb,'overwrite missing fat');
select public.health_sync_import(current_setting('health_test.hash_a'),
 '[{"date":"2020-01-01","weight_kg":72,"body_fat_pct":null}]','overwrite');
select public.health_sync_import(current_setting('health_test.hash_b'),
 '[{"date":"2020-01-01","weight_kg":300,"body_fat_pct":70}]');
reset role;
select pg_temp.check_ok((select bodyweight_kg=72 and body_fat_pct=15.5 from public.bodyweight_logs where user_id='e0000000-0000-4000-8000-000000000001' and recorded_on='2020-01-01'),'fat preserved rounded');
select pg_temp.check_ok((select bodyweight_kg=300 from public.bodyweight_logs where user_id='e0000000-0000-4000-8000-000000000002'),'other owner');
select set_config('health_test.success_at',(select last_synced_at::text from health_sync_private.tokens where user_id='e0000000-0000-4000-8000-000000000001'),true);
set local role service_role;
do $$ declare bad jsonb;
begin
 for bad in select value from jsonb_array_elements('[
 [],{},null,
 [{"date":"2020-02-30","weight_kg":70}],
 [{"date":"0000-01-01","weight_kg":70}],
 [{"date":"2020-1-01","weight_kg":70}],
 [{"date":20200101,"weight_kg":70}],
 [{"date":"2020-01-03","weight_kg":"70"}],
 [{"date":"2020-01-03","weight_kg":19.99}],
 [{"date":"2020-01-03","weight_kg":300.01}],
 [{"date":"2020-01-03","weight_kg":70,"body_fat_pct":0}],
 [{"date":"2020-01-03","weight_kg":70,"body_fat_pct":70.1}],
 [{"date":"2020-01-03","weight_kg":70,"user_id":"other"}],
 [{"date":"2020-01-03","weight_kg":70},{"date":"2020-01-03","weight_kg":71}],
 [{"date":"2020-01-03","weight_kg":70},{"date":"2020-01-04","weight_kg":null}]
 ]'::jsonb) loop
  perform pg_temp.expect_error(format('select public.health_sync_import(%L,%L::jsonb)',current_setting('health_test.hash_a'),bad),'22023');
 end loop;
 perform pg_temp.expect_error(format('select public.health_sync_import(%L,null)',current_setting('health_test.hash_a')),'22023');
 perform pg_temp.expect_error(format('select public.health_sync_import(%L,%L,null)',current_setting('health_test.hash_a'),'[{"date":"2020-01-03","weight_kg":70}]'),'22023');
 perform pg_temp.expect_error(format('select public.health_sync_import(%L,%L,''delete'')',current_setting('health_test.hash_a'),'[{"date":"2020-01-03","weight_kg":70}]'),'22023');
end $$;
select pg_temp.expect_error(format('select public.health_sync_import(%L,%L)',current_setting('health_test.hash_a'),
 (select jsonb_agg(jsonb_build_object('date',to_char('2021-01-01'::date+i,'YYYY-MM-DD'),'weight_kg',70)) from generate_series(0,500) i)),'22023');
reset role;
select pg_temp.check_ok(not exists(select 1 from public.bodyweight_logs where recorded_on='2020-01-03'),'no partial batch writes');
select pg_temp.check_ok((select last_synced_at::text=current_setting('health_test.success_at') from health_sync_private.tokens where user_id='e0000000-0000-4000-8000-000000000001'),'failure preserves status');
-- A database failure after the first write must also roll back all rows/status.
create function pg_temp.fail_health_write() returns trigger language plpgsql as $$
begin if new.recorded_on='2099-12-31'::date then raise exception 'Synthetic failure'; end if; return new; end $$;
create trigger health_test_failure before insert on public.bodyweight_logs for each row execute function pg_temp.fail_health_write();
set local role service_role;
select pg_temp.expect_error(format('select public.health_sync_import(%L,%L)',current_setting('health_test.hash_a'),
 '[{"date":"2099-12-30","weight_kg":70},{"date":"2099-12-31","weight_kg":70}]'),'P0001');
reset role;
select pg_temp.check_ok(not exists(select 1 from public.bodyweight_logs where recorded_on>='2099-12-30'),'write failure atomic');
select pg_temp.check_ok((select last_synced_at::text=current_setting('health_test.success_at') from health_sync_private.tokens where user_id='e0000000-0000-4000-8000-000000000001'),'write failure preserves status');
drop trigger health_test_failure on public.bodyweight_logs;
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
select pg_temp.check_ok((select count(*)=2 from public.bodyweight_logs),'existing owner RLS retained');
reset role;
set local role service_role;
select pg_temp.check_ok(public.health_sync_import(current_setting('health_test.hash_a'),
 (select jsonb_agg(jsonb_build_object('date',to_char('2021-01-01'::date+i,'YYYY-MM-DD'),'weight_kg',70)) from generate_series(0,499) i))
 = '{"inserted":500,"updated":0,"skipped":0}'::jsonb,'500 max valid');
reset role;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.check_ok(public.health_sync_status()->>'last_synced_count'='500','status success count');
select set_config('health_test.new_token',public.health_sync_issue_token()->>'token',true);
select pg_temp.check_ok(current_setting('health_test.new_token')<>current_setting('health_test.token_a'),'rotation distinct');
reset role;
set local role service_role;
select pg_temp.expect_error(format('select public.health_sync_import(%L,%L)',current_setting('health_test.hash_a'),'[{"date":"2020-01-01","weight_kg":70}]'),'28000');
reset role;
select set_config('health_test.new_hash',encode(extensions.digest(current_setting('health_test.new_token'),'sha256'),'hex'),true);
set local role authenticated;
select public.health_sync_revoke_token();
select pg_temp.check_ok(public.health_sync_status()->>'enabled'='false','revoked');
select public.health_sync_revoke_token();
reset role;
set local role service_role;
select pg_temp.expect_error(format('select public.health_sync_import(%L,%L)',current_setting('health_test.new_hash'),'[{"date":"2020-01-01","weight_kg":70}]'),'28000');
-- Other user's credential still works after first user's revoke.
select pg_temp.check_ok(public.health_sync_import(current_setting('health_test.hash_b'),'[{"date":"2020-01-01","weight_kg":70}]')->>'skipped'='1','revoke owner isolation');
reset role;
rollback;
