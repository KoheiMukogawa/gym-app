begin;

-- A single scalar JSON result avoids the Data API's row pagination. No RM or
-- PR calculation lives here: buildStrengthSnapshot remains the source of truth.
create or replace function public.my_big3_data()
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  with own_mappings as materialized (
    select m.user_id, m.lift_type, m.exercise_id
    from public.big3_exercise_mappings m
    where m.user_id = caller_id
  ), candidate_exercises as materialized (
    select e.id, e.name, e.name_normalized, e.is_preset
    from public.exercises e
    where (e.is_preset and e.name_normalized in ('スクワット', 'ベンチプレス', 'デッドリフト'))
      or exists (select 1 from own_mappings m where m.exercise_id = e.id)
  ), resolved_ids as (
    -- Match resolveBig3Exercises: an explicit mapping never falls back, even
    -- when its target is not visible to the caller. Deduplicate shared targets.
    select distinct case when m.exercise_id is not null then m.exercise_id else e.id end as id
    from (values ('squat', 'スクワット'), ('bench', 'ベンチプレス'), ('deadlift', 'デッドリフト')) as lifts(key, label)
    left join own_mappings m on m.lift_type = lifts.key
    left join candidate_exercises e on e.is_preset and e.name_normalized = lifts.label
  ), own_workouts as materialized (
    select w.id, w.performed_at
    from public.workouts w
    where w.user_id = caller_id
  ), own_sets as (
    select s.id, s.exercise_id, s.weight_kg, s.reps, w.performed_at
    from own_workouts w
    join public.workout_sets s on s.workout_id = w.id
    where exists (select 1 from resolved_ids r where r.id = s.exercise_id)
      and exists (select 1 from candidate_exercises e where e.id = s.exercise_id)
  )
  select jsonb_build_object(
    'mappings', coalesce((select jsonb_agg(to_jsonb(m) order by m.lift_type) from own_mappings m), '[]'::jsonb),
    'exercises', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from candidate_exercises e), '[]'::jsonb),
    'sets', coalesce((select jsonb_agg(jsonb_build_object(
      'exercise_id', s.exercise_id, 'weight_kg', s.weight_kg,
      'reps', s.reps, 'performed_at', s.performed_at
    ) order by s.id) from own_sets s), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.my_big3_data() from public, anon, authenticated, service_role;
grant execute on function public.my_big3_data() to authenticated;
notify pgrst, 'reload schema';
commit;
