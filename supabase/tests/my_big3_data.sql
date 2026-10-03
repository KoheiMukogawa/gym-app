-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('e0000000-0000-4000-8000-000000000001', 'rpc1@example.com', '{"display_name":"RPC本人"}'),
 ('e0000000-0000-4000-8000-000000000002', 'rpc2@example.com', '{"display_name":"RPC別人"}');
insert into public.exercises(id, name, name_normalized, muscle_group, created_by) values
 ('e1000000-0000-4000-8000-000000000001', 'ベンチプレス', 'ベンチプレス', 'chest', 'e0000000-0000-4000-8000-000000000001'),
 ('e1000000-0000-4000-8000-000000000002', '対象外', '対象外', 'arms', 'e0000000-0000-4000-8000-000000000001');
insert into public.workouts(id, user_id, performed_at) values
 ('e2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '2026-09-01T15:30:00Z'),
 ('e2000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', '2026-09-01T15:30:00Z');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select 'e2000000-0000-4000-8000-000000000001', e.id, n, case when n=1001 then 120 else 80 end, 1
 from public.exercises e cross join generate_series(1,1001) n
 where e.is_preset and e.name_normalized='ベンチプレス';
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select 'e2000000-0000-4000-8000-000000000001', e.id, 1002, 160, 5
 from public.exercises e where e.is_preset and e.name_normalized in ('スクワット','デッドリフト');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps) values
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',1003,130,1),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',1004,90,5),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',1005,30,10);
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select 'e2000000-0000-4000-8000-000000000002', id, 1, 900, 1
 from public.exercises where is_preset and name_normalized='ベンチプレス';

do $$ begin
 if (select prosecdef from pg_proc where oid='public.my_big3_data()'::regprocedure) then raise exception 'Must use invoker privileges'; end if;
 if has_function_privilege('anon','public.my_big3_data()','execute') then raise exception 'Anon execute grant'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
do $$ declare d jsonb := public.my_big3_data(); begin
 if jsonb_array_length(d->'exercises')<>3 or jsonb_array_length(d->'mappings')<>0 then raise exception 'Preset candidates'; end if;
 if jsonb_array_length(d->'sets')<>1003 then raise exception 'Incomplete history or unrelated sets'; end if;
 if exists(select 1 from jsonb_array_elements(d->'sets') s where (s->>'weight_kg')::numeric=900) then raise exception 'Other user leaked'; end if;
 if not exists(select 1 from jsonb_array_elements(d->'sets') s where (s->>'weight_kg')::numeric=120) then raise exception 'PR past 1000 lost'; end if;
 if exists(select 1 from jsonb_array_elements(d->'sets') s where (s->>'performed_at')::timestamptz<>'2026-09-01T15:30:00Z'::timestamptz) then raise exception 'Timestamp changed'; end if;
end $$;
insert into public.big3_exercise_mappings(user_id,lift_type,exercise_id) values
 ('e0000000-0000-4000-8000-000000000001','bench','e1000000-0000-4000-8000-000000000001');
do $$ declare d jsonb := public.my_big3_data(); begin
 if jsonb_array_length(d->'exercises')<>4 or jsonb_array_length(d->'mappings')<>1 or jsonb_array_length(d->'sets')<>4 then raise exception 'Mapped exercise resolution'; end if;
 if exists(select 1 from jsonb_array_elements(d->'sets') s where (s->>'weight_kg')::numeric in (80,120,900)) then raise exception 'Mapped lift fell back'; end if;
end $$;
insert into public.big3_exercise_mappings(user_id,lift_type,exercise_id) values
 ('e0000000-0000-4000-8000-000000000001','squat','e1000000-0000-4000-8000-000000000001');
do $$ begin
 if jsonb_array_length(public.my_big3_data()->'sets')<>3 then raise exception 'Shared target duplicated sets'; end if;
end $$;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000002',true);
do $$ declare d jsonb := public.my_big3_data(); begin
 if jsonb_array_length(d->'mappings')<>0 or jsonb_array_length(d->'sets')<>1 then raise exception 'Caller isolation'; end if;
 if (d->'sets'->0->>'weight_kg')::numeric<>900 then raise exception 'Other caller result'; end if;
end $$;
-- Temporarily hide mapped custom exercises to prove invoker RLS is respected
-- and an unavailable mapping does not silently restore the preset.
reset role;
drop policy exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated using (is_preset);
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
do $$ declare d jsonb := public.my_big3_data(); begin
 if jsonb_array_length(d->'exercises')<>3 or jsonb_array_length(d->'sets')<>1 then raise exception 'Invoker RLS or unavailable mapping fallback'; end if;
end $$;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000003',true);
do $$ declare d jsonb := public.my_big3_data(); begin
 if d->'sets'<>'[]'::jsonb or d->'mappings'<>'[]'::jsonb then raise exception 'Empty history must be arrays'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin perform public.my_big3_data(); raise exception 'Missing auth allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.my_big3_data(); raise exception 'Anon invocation allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
