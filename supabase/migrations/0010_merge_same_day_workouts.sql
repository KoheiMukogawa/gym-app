-- One workout per user per day (Asia/Tokyo).
-- Moves sets from later same-day workouts into the earliest one, renumbers the
-- merged workouts' sets, then deletes the emptied duplicates. Safe to run more than once.
do $$
begin
  create temporary table merge_map on commit drop as
  select id, keep_id from (
    select id,
           first_value(id) over (
             partition by user_id, (performed_at at time zone 'Asia/Tokyo')::date
             order by performed_at, id
           ) as keep_id
    from public.workouts
  ) ranked
  where id <> keep_id;

  update public.workout_sets s
     set workout_id = m.keep_id
    from merge_map m
   where s.workout_id = m.id;

  -- Keep set_index counting up per exercise in the order the sets were recorded.
  update public.workout_sets s
     set set_index = n.n
    from (
      select id, row_number() over (partition by workout_id, exercise_id order by created_at, id) as n
      from public.workout_sets
      where workout_id in (select keep_id from merge_map)
    ) n
   where s.id = n.id and s.set_index <> n.n;

  delete from public.workouts w
   using merge_map m
   where w.id = m.id
     and not exists (select 1 from public.workout_sets s where s.workout_id = w.id);
end $$;
