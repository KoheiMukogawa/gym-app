-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('f0000000-0000-4000-8000-00000000000a', 'admin@glog.test', '{"display_name":"運営"}'),
 ('f0000000-0000-4000-8000-00000000000b', 'b@glog.test', '{"display_name":"B","signup_source":"calc-1rm"}'),
 ('f0000000-0000-4000-8000-00000000000c', 'c@glog.test', '{"display_name":"C","signup_source":"calc-1rm"}'),
 ('f0000000-0000-4000-8000-00000000000d', 'd@glog.test', '{"display_name":"D","signup_source":"landing"}'),
 ('f0000000-0000-4000-8000-00000000000e', 'e@glog.test', '{"display_name":"E"}'),
 ('f0000000-0000-4000-8000-0000000000ff', 'e2e@example.com', '{"display_name":"テスト","signup_source":"calc-dots"}');
insert into public.admins(user_id) values ('f0000000-0000-4000-8000-00000000000a');

-- t: today in Japan. A signed up long ago (outside the 90-day sign-up window).
-- B, C and the test account signed up 40 days ago; D 3 days ago; E today.
create temp table k as select (now() at time zone 'Asia/Tokyo')::date as t;
update public.profiles set created_at = now() - interval '200 days' where id = 'f0000000-0000-4000-8000-00000000000a';
update public.profiles set created_at = ((select t from k) - 40 + time '09:00') at time zone 'Asia/Tokyo'
 where id in ('f0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-00000000000c', 'f0000000-0000-4000-8000-0000000000ff');
update public.profiles set created_at = ((select t from k) - 3 + time '09:00') at time zone 'Asia/Tokyo' where id = 'f0000000-0000-4000-8000-00000000000d';
update public.profiles set created_at = now() where id = 'f0000000-0000-4000-8000-00000000000e';

insert into public.workouts(id, user_id, performed_at) values
 -- B: day 1, day 8, day 31 after signing up → retained at D1, D7 and D30.
 ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b', ((select t from k) - 39 + time '20:00') at time zone 'Asia/Tokyo'),
 ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000b', ((select t from k) - 32 + time '20:00') at time zone 'Asia/Tokyo'),
 ('f1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000b', ((select t from k) - 9 + time '20:00') at time zone 'Asia/Tokyo'),
 -- C: day 0 only, then two days in the last week (a frequent lifter now).
 ('f1000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-00000000000c', ((select t from k) - 40 + time '20:00') at time zone 'Asia/Tokyo'),
 ('f1000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-00000000000c', now() - interval '1 day'),
 ('f1000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-00000000000c', now() - interval '3 days'),
 -- D: day 1 (D7/D30 not yet eligible), within the last week.
 ('f1000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-00000000000d', ((select t from k) - 2 + time '20:00') at time zone 'Asia/Tokyo'),
 -- A: in the future (never counted). Test account: yesterday (never counted).
 ('f1000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-00000000000a', now() + interval '2 days'),
 ('f1000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-0000000000ff', now() - interval '1 day');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select w.id, e.id, n, 60, 5
 from (values ('f1000000-0000-4000-8000-000000000005'::uuid, 3), ('f1000000-0000-4000-8000-000000000006'::uuid, 2),
              ('f1000000-0000-4000-8000-000000000007'::uuid, 1), ('f1000000-0000-4000-8000-000000000009'::uuid, 4)) as w(id, sets)
 cross join generate_series(1, w.sets) n
 cross join (select id from public.exercises where is_preset and name_normalized = 'ベンチプレス') e;

do $$ begin
  if has_function_privilege('anon', 'public.admin_growth_stats()', 'execute') then raise exception 'anon can run growth stats'; end if;
  if not has_function_privilege('authenticated', 'public.admin_growth_stats()', 'execute') then raise exception 'authenticated cannot run growth stats'; end if;
end $$;

set local role authenticated;

select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.admin_growth_stats(); raise exception 'ran signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-00000000000b', true);
do $$ begin
  begin perform public.admin_growth_stats(); raise exception 'non-admin ran growth stats';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-00000000000a', true);
do $$ declare s jsonb := public.admin_growth_stats();
begin
  -- C (2 days) and D (1 day) lifted in the last 7 days; 3 + 2 + 1 sets across 3 workouts.
  if (s->>'weekly_active_lifters')::int <> 2 then raise exception 'weekly_active_lifters %', s; end if;
  if (s->>'lifters_2plus_days_7d')::int <> 1 then raise exception 'lifters_2plus_days_7d %', s; end if;
  if (s->>'workouts_7d')::int <> 3 or (s->>'sets_7d')::int <> 6 then raise exception 'volume %', s; end if;
  -- D1 eligible: A, B, C, D (E signed up today). Retained: B and D.
  if s->'retention'->'d1' <> '{"eligible":4,"retained":2}'::jsonb then raise exception 'd1 %', s->'retention'; end if;
  -- D7 eligible: A, B, C. Retained: B.  D30 eligible: A, B, C. Retained: B.
  if s->'retention'->'d7' <> '{"eligible":3,"retained":1}'::jsonb then raise exception 'd7 %', s->'retention'; end if;
  if s->'retention'->'d30' <> '{"eligible":3,"retained":1}'::jsonb then raise exception 'd30 %', s->'retention'; end if;
  if s->'signups_by_source_90d' <> '[{"source":"calc-1rm","signups":2},{"source":"landing","signups":1},{"source":"unknown","signups":1}]'::jsonb then
    raise exception 'sources %', s->'signups_by_source_90d'; end if;
end $$;
rollback;
