-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('c0000000-0000-4000-8000-00000000000a', 'goal-a@glog.test', '{"display_name":"A"}'),
 ('c0000000-0000-4000-8000-00000000000b', 'goal-b@glog.test', '{"display_name":"B"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-00000000000a', true);
-- The owner stores per-lift goals next to the total; they stay optional.
insert into public.strength_goals(id, user_id, label, target_date, target_total_kg, target_squat_kg, target_bench_kg, target_deadlift_kg)
 values ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', 'Big3目標', '2027-01-01', 500, 180, 120.5, null);
do $$ begin
  begin
    update public.strength_goals set target_bench_kg = 0 where id = 'c0000000-0000-4000-8000-00000000000a';
    raise exception 'zero lift goal accepted';
  exception when check_violation then null; end;
end $$;

-- Another user can neither read nor change them.
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-00000000000b', true);
do $$ begin
  if exists (select 1 from public.strength_goals) then raise exception 'other user goal visible'; end if;
end $$;
update public.strength_goals set target_squat_kg = 999 where id = 'c0000000-0000-4000-8000-00000000000a';

reset role;
do $$ begin
  if (select target_squat_kg from public.strength_goals where id = 'c0000000-0000-4000-8000-00000000000a') <> 180 then
    raise exception 'other user changed a goal'; end if;
  if (select target_deadlift_kg from public.strength_goals where id = 'c0000000-0000-4000-8000-00000000000a') is not null then
    raise exception 'optional lift goal not null'; end if;
end $$;
rollback;
