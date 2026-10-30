-- Make the operator dashboard actionable without exposing individual activity.
-- Compare the latest rolling seven days with the preceding seven days, and show
-- how many registered members reached a first and a second workout day.
begin;
create or replace function public.admin_growth_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
 u uuid := auth.uid();
 today date := (now() at time zone 'Asia/Tokyo')::date;
 result jsonb;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 with members as (
  select p.id, (p.created_at at time zone 'Asia/Tokyo')::date as signup_day, p.created_at,
         nullif(au.raw_user_meta_data->>'signup_source', '') as source
  from public.profiles p left join auth.users au on au.id = p.id
  where au.email is null or au.email not like '%@example.com'
 ), days as (
  select w.user_id, (w.performed_at at time zone 'Asia/Tokyo')::date as day
  from public.workouts w join members m on m.id = w.user_id
  where w.performed_at <= now()
  group by w.user_id, (w.performed_at at time zone 'Asia/Tokyo')::date
 ), member_progress as (
  select m.id, count(d.day) as workout_days
  from members m left join days d on d.user_id = m.id
  group by m.id
 ), recent_workouts as (
  select w.id, w.user_id, w.performed_at,
         case when w.performed_at > now() - interval '7 days' then 'current' else 'previous' end as period
  from public.workouts w join members m on m.id = w.user_id
  where w.performed_at > now() - interval '14 days' and w.performed_at <= now()
 ), lifters as (
  select r.period, r.user_id,
         count(distinct (r.performed_at at time zone 'Asia/Tokyo')::date) as lift_days
  from recent_workouts r group by r.period, r.user_id
 ), period_stats as (
  select p.period,
         count(distinct l.user_id) as active_lifters,
         count(distinct l.user_id) filter (where l.lift_days >= 2) as frequent_lifters,
         count(distinct r.id) as workouts,
         count(s.*) as sets
  from (values ('current'), ('previous')) p(period)
  left join lifters l on l.period = p.period
  left join recent_workouts r on r.period = p.period and r.user_id = l.user_id
  left join public.workout_sets s on s.workout_id = r.id
  group by p.period
 ), retention as (
  select k.name, k.first_day, k.last_day,
         count(*) filter (where m.signup_day + k.last_day < today) as eligible,
         count(*) filter (where m.signup_day + k.last_day < today and exists (
           select 1 from days d where d.user_id = m.id and d.day between m.signup_day + k.first_day and m.signup_day + k.last_day
         )) as retained
  from (values ('d1', 1, 1), ('d7', 7, 13), ('d30', 30, 36)) as k(name, first_day, last_day)
  cross join members m
  group by k.name, k.first_day, k.last_day
 )
 select jsonb_build_object(
  'weekly_active_lifters', (select active_lifters from period_stats where period = 'current'),
  'previous_weekly_active_lifters', (select active_lifters from period_stats where period = 'previous'),
  'lifters_2plus_days_7d', (select frequent_lifters from period_stats where period = 'current'),
  'previous_lifters_2plus_days_7d', (select frequent_lifters from period_stats where period = 'previous'),
  'workouts_7d', (select workouts from period_stats where period = 'current'),
  'previous_workouts_7d', (select workouts from period_stats where period = 'previous'),
  'sets_7d', (select sets from period_stats where period = 'current'),
  'previous_sets_7d', (select sets from period_stats where period = 'previous'),
  'signups_7d', (select count(*) from members where created_at > now() - interval '7 days' and created_at <= now()),
  'previous_signups_7d', (select count(*) from members where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
  'activation', jsonb_build_object(
    'registered', (select count(*) from member_progress),
    'first_workout', (select count(*) from member_progress where workout_days >= 1),
    'second_workout_day', (select count(*) from member_progress where workout_days >= 2)
  ),
  'retention', (select jsonb_object_agg(r.name, jsonb_build_object('eligible', r.eligible, 'retained', r.retained)) from retention r),
  'signups_by_source_90d', coalesce((select jsonb_agg(jsonb_build_object('source', x.source, 'signups', x.signups) order by x.signups desc, x.source)
     from (select coalesce(m.source, 'unknown') as source, count(*) as signups from members m
           where m.created_at > now() - interval '90 days' group by 1) x), '[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.admin_growth_stats() from public, anon;
grant execute on function public.admin_growth_stats() to authenticated;
commit;
