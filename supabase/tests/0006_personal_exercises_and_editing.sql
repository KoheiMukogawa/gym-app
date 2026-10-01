-- Run on a disposable database after migrations 0001-0006. All fixtures roll back.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000601', 'editor1@example.test', '{}'),
 ('00000000-0000-4000-8000-000000000602', 'editor2@example.test', '{}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000601', true);
insert into public.exercises (id, name, name_normalized, muscle_group, is_preset, created_by)
 values ('00000000-0000-4000-8000-000000000611', 'デクラインベンチプレス', 'デクラインベンチプレス', 'chest', false, auth.uid());
do $$ begin
  begin
    insert into public.exercises (name, name_normalized, muscle_group, is_preset, created_by)
      values ('デクラインベンチプレス', 'デクラインベンチプレス', 'chest', false, auth.uid());
    raise exception 'Same-owner duplicate should fail';
  exception when unique_violation then null; end;
end $$;
insert into public.workouts (id, user_id, performed_at)
 values ('00000000-0000-4000-8000-000000000621', auth.uid(), '2020-02-03T12:00:00+09:00');
insert into public.workout_sets (id, workout_id, exercise_id, set_index, weight_kg, reps)
 values ('00000000-0000-4000-8000-000000000631', '00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000611', 1, 60, 8);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000602', true);
-- Same name may belong to another user's personal catalog.
insert into public.exercises (name, name_normalized, muscle_group, is_preset, created_by)
 values ('デクラインベンチプレス', 'デクラインベンチプレス', 'chest', false, auth.uid());
do $$ begin
  update public.workouts set performed_at = now() where id = '00000000-0000-4000-8000-000000000621';
  if found then raise exception 'Another user changed workout date'; end if;
  update public.workout_sets set weight_kg = 100 where id = '00000000-0000-4000-8000-000000000631';
  if found then raise exception 'Another user changed set'; end if;
  delete from public.workout_sets where id = '00000000-0000-4000-8000-000000000631';
  if found then raise exception 'Another user deleted set'; end if;
  delete from public.workouts where id = '00000000-0000-4000-8000-000000000621';
  if found then raise exception 'Another user deleted workout'; end if;
  begin
    insert into public.workout_sets (workout_id, exercise_id, set_index, weight_kg, reps)
      values ('00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000611', 2, 20, 10);
    raise exception 'Another user inserted into workout';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000601', true);
update public.workouts set performed_at = '2020-02-04T12:00:00+09:00'
 where id = '00000000-0000-4000-8000-000000000621';
-- Lost-response retry updates the existing set instead of duplicating it.
insert into public.workout_sets (id, workout_id, exercise_id, set_index, weight_kg, reps)
 values ('00000000-0000-4000-8000-000000000631', '00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000611', 1, 62.5, 9)
 on conflict (id) do update set weight_kg = excluded.weight_kg, reps = excluded.reps;
do $$ begin
  if (select count(*) from public.workout_sets where workout_id = '00000000-0000-4000-8000-000000000621') <> 1 then
    raise exception 'Retry duplicated a set'; end if;
  if not exists (select 1 from public.workout_sets where id = '00000000-0000-4000-8000-000000000631' and weight_kg = 62.5 and reps = 9) then
    raise exception 'Correction was not saved'; end if;
  if not exists (select 1 from public.workouts where id = '00000000-0000-4000-8000-000000000621' and performed_at = '2020-02-04T12:00:00+09:00') then
    raise exception 'Date was not saved'; end if;
  delete from public.workout_sets where id = '00000000-0000-4000-8000-000000000631';
  if not found then raise exception 'Owner could not delete set'; end if;
  delete from public.workouts where id = '00000000-0000-4000-8000-000000000621';
  if not found then raise exception 'Owner could not delete workout'; end if;
end $$;
rollback;
