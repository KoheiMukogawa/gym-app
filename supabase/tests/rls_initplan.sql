-- Synthetic fixtures only; the entire suite is rolled back.
begin;
-- Every public policy calls auth.uid() through a scalar subquery.
do $$ declare bad text; begin
  select string_agg(tablename||'.'||policyname, ', ') into bad from pg_policies
  where schemaname='public'
    and (regexp_replace(coalesce(qual,''), '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)'
      or regexp_replace(coalesce(with_check,''), '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)');
  if bad is not null then raise exception 'Per-row auth.uid() remains: %', bad; end if;
end $$;

insert into auth.users(id, email, raw_user_meta_data) values
 ('f0000000-0000-4000-8000-000000000001', 'rls1@example.com', '{"display_name":"本人"}'),
 ('f0000000-0000-4000-8000-000000000002', 'rls2@example.com', '{"display_name":"別人"}');
insert into public.workouts(id, user_id) values
 ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'),
 ('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select w, id, 1, 60, 5 from public.exercises,
  unnest(array['f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002']::uuid[]) w
 where is_preset and name_normalized='ベンチプレス';
insert into public.bodyweight_logs(user_id, recorded_on, bodyweight_kg) values
 ('f0000000-0000-4000-8000-000000000001', '2026-10-01', 70),
 ('f0000000-0000-4000-8000-000000000002', '2026-10-01', 80);

set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.workouts where id::text like 'f2000000-%') <> 1 then raise exception 'workouts not isolated'; end if;
  if (select count(*) from public.workout_sets s join public.workouts w on w.id=s.workout_id where w.id::text like 'f2000000-%') <> 1 then raise exception 'sets not isolated'; end if;
  if (select count(*) from public.bodyweight_logs where user_id::text like 'f0000000-%') <> 1 then raise exception 'bodyweight not isolated'; end if;
  if (select count(*) from public.profiles where id::text like 'f0000000-%') <> 1 then raise exception 'profiles not isolated'; end if;
  update public.workouts set note='x' where id='f2000000-0000-4000-8000-000000000002';
  if found then raise exception 'updated another user''s workout'; end if;
  begin
    insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
     select 'f2000000-0000-4000-8000-000000000002', id, 2, 60, 5 from public.exercises where is_preset limit 1;
    raise exception 'inserted a set into another user''s workout';
  exception when insufficient_privilege then null;
  end;
  insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
   select 'f2000000-0000-4000-8000-000000000001', id, 2, 60, 5 from public.exercises where is_preset limit 1;
end $$;
rollback;
