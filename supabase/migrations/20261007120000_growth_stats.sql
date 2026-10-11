-- Growth metrics for operators, computed from the records themselves (no event tracking):
-- Weekly Active Lifters, how often they lift, retention by sign-up cohort, and sign-ups by the
-- first public page that brought them (signup_source in the sign-up metadata).
-- Aggregate counts only. Days are Japan-time calendar days; @example.com accounts are left out.
--
-- Retention (share of eligible members who recorded a workout in the window after signing up):
--   D1  = on day 1           (eligible once day 1 has ended)
--   D7  = on days 7 to 13    (eligible once day 13 has ended)
--   D30 = on days 30 to 36   (eligible once day 36 has ended)
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
  select distinct w.user_id, (w.performed_at at time zone 'Asia/Tokyo')::date as day
  from public.workouts w join members m on m.id = w.user_id
  where w.performed_at <= now()
 ), recent as (
  select w.id, w.user_id from public.workouts w join members m on m.id = w.user_id
  where w.performed_at > now() - interval '7 days' and w.performed_at <= now()
 ), lifters as (
  select r.user_id, count(distinct (w.performed_at at time zone 'Asia/Tokyo')::date) as lift_days
  from recent r join public.workouts w on w.id = r.id group by r.user_id
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
  'weekly_active_lifters', (select count(*) from lifters),
  'lifters_2plus_days_7d', (select count(*) from lifters where lift_days >= 2),
  'workouts_7d', (select count(*) from recent),
  'sets_7d', (select count(*) from public.workout_sets s join recent r on r.id = s.workout_id),
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
