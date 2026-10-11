-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('b0000000-0000-4000-8000-00000000000a', 'zero@glog.test', '{"display_name":"Z"}');
insert into public.workouts(id, user_id) values ('b1000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000a');

-- A failed set keeps zero reps; negative reps are still refused.
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select 'b1000000-0000-4000-8000-00000000000a', id, 1, 140, 0 from public.exercises where is_preset and name_normalized = 'ベンチプレス';
do $$ begin
  begin
    insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
     select 'b1000000-0000-4000-8000-00000000000a', id, 2, 140, -1 from public.exercises where is_preset and name_normalized = 'ベンチプレス';
    raise exception 'negative reps accepted';
  exception when check_violation then null; end;
  if (select reps from public.workout_sets where workout_id = 'b1000000-0000-4000-8000-00000000000a') <> 0 then
    raise exception 'zero reps not stored'; end if;
end $$;
rollback;
