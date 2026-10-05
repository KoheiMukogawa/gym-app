-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('e0000000-0000-4000-8000-00000000000a', 'admin@glog.test', '{"display_name":"運営"}'),
 ('e0000000-0000-4000-8000-00000000000b', 'b@glog.test', '{"display_name":"B"}'),
 ('e0000000-0000-4000-8000-00000000000c', 'c@glog.test', '{"display_name":"C"}'),
 ('e0000000-0000-4000-8000-00000000000d', 'd@glog.test', '{"display_name":"D"}'),
 ('e0000000-0000-4000-8000-00000000000e', 'e@glog.test', '{"display_name":"E"}'),
 ('e0000000-0000-4000-8000-0000000000ff', 'e2e@example.com', '{"display_name":"テスト"}');
insert into public.admins(user_id) values ('e0000000-0000-4000-8000-00000000000a');

-- wa: the Monday three weeks before this week (Japan time), far from the 7-day window.
create temp table k as select date_trunc('week', now() at time zone 'Asia/Tokyo')::date - 21 as wa;
-- Everyone signed up long ago, except B and the test account, who signed up in week wa.
update public.profiles set created_at = now() - interval '200 days'
 where id in ('e0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000d', 'e0000000-0000-4000-8000-00000000000e');
update public.profiles set created_at = ((select wa from k) + time '10:00') at time zone 'Asia/Tokyo'
 where id in ('e0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-0000000000ff');

insert into public.workouts(id, user_id, performed_at) values
 -- B: Monday 00:30 and Tuesday of week wa.
 ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000b', ((select wa from k) + time '00:30') at time zone 'Asia/Tokyo'),
 ('e1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000b', ((select wa from k) + 1 + time '12:00') at time zone 'Asia/Tokyo'),
 -- A: Sunday 23:30 just before week wa, so the week before.
 ('e1000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000a', ((select wa from k) - 1 + time '23:30') at time zone 'Asia/Tokyo'),
 -- The test account in week wa: never counted.
 ('e1000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-0000000000ff', ((select wa from k) + 2 + time '12:00') at time zone 'Asia/Tokyo'),
 -- C yesterday, D in the future, E long ago.
 ('e1000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-00000000000c', now() - interval '1 day'),
 ('e1000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000d', now() + interval '2 days'),
 ('e1000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000000e', now() - interval '100 days');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select w.id, e.id, n, 60, 5
 from (values ('e1000000-0000-4000-8000-000000000001'::uuid, 2), ('e1000000-0000-4000-8000-000000000002'::uuid, 1),
              ('e1000000-0000-4000-8000-000000000003'::uuid, 1), ('e1000000-0000-4000-8000-000000000004'::uuid, 5),
              ('e1000000-0000-4000-8000-000000000005'::uuid, 1)) as w(id, sets)
 cross join generate_series(1, w.sets) n
 cross join (select id from public.exercises where is_preset and name_normalized = 'ベンチプレス') e;
grant select on k to authenticated;

-- anon cannot run it; authenticated can.
do $$ begin
  if has_function_privilege('anon', 'public.admin_usage_stats()', 'execute') then raise exception 'anon can run usage stats'; end if;
  if not has_function_privilege('authenticated', 'public.admin_usage_stats()', 'execute') then raise exception 'authenticated cannot run usage stats'; end if;
end $$;

set local role authenticated;

-- Signed out and non-admins are refused.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.admin_usage_stats(); raise exception 'ran signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000b', true);
do $$ begin
  begin perform public.admin_usage_stats(); raise exception 'non-admin ran usage stats';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
end $$;

-- The admin gets the totals and the weekly series.
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000a', true);
do $$ declare s jsonb := public.admin_usage_stats(); wa date := (select wa from k); w jsonb; this_week date := date_trunc('week', now() at time zone 'Asia/Tokyo')::date;
begin
  if (s->>'total_users')::int <> 5 then raise exception 'total_users %', s->'total_users'; end if;
  if (s->>'active_7d')::int <> 1 then raise exception 'active_7d %', s->'active_7d'; end if;
  if (s->>'active_30d')::int <> 3 then raise exception 'active_30d %', s->'active_30d'; end if;
  if jsonb_array_length(s->'weeks') <> 12 then raise exception 'weeks %', jsonb_array_length(s->'weeks'); end if;
  if s->'weeks'->0->>'week_start' <> to_char(this_week - 77, 'YYYY-MM-DD')
    or s->'weeks'->11->>'week_start' <> to_char(this_week, 'YYYY-MM-DD') then raise exception 'week range %', s->'weeks'; end if;
  select x into w from jsonb_array_elements(s->'weeks') x where x->>'week_start' = to_char(wa, 'YYYY-MM-DD');
  if w <> jsonb_build_object('week_start', to_char(wa, 'YYYY-MM-DD'), 'active_users', 1, 'workouts', 2, 'sets', 3, 'signups', 1) then
    raise exception 'week wa %', w; end if;
  select x into w from jsonb_array_elements(s->'weeks') x where x->>'week_start' = to_char(wa - 7, 'YYYY-MM-DD');
  if w <> jsonb_build_object('week_start', to_char(wa - 7, 'YYYY-MM-DD'), 'active_users', 1, 'workouts', 1, 'sets', 1, 'signups', 0) then
    raise exception 'week before wa %', w; end if;
  select x into w from jsonb_array_elements(s->'weeks') x where x->>'week_start' = to_char(wa - 14, 'YYYY-MM-DD');
  if w <> jsonb_build_object('week_start', to_char(wa - 14, 'YYYY-MM-DD'), 'active_users', 0, 'workouts', 0, 'sets', 0, 'signups', 0) then
    raise exception 'empty week %', w; end if;
end $$;
rollback;
