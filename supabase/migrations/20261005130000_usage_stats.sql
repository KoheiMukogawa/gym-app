-- Usage dashboard for operators: aggregate counts only, never anyone's rows.
-- A day of use is a day with a recorded workout; weeks start on Monday in Japan time.
-- Test accounts (@example.com) are left out.
begin;
create or replace function public.admin_usage_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
 u uuid := auth.uid();
 this_week date := date_trunc('week', now() at time zone 'Asia/Tokyo')::date;
 result jsonb;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 with members as (
  select p.id, date_trunc('week', p.created_at at time zone 'Asia/Tokyo')::date as signup_week
  from public.profiles p left join auth.users au on au.id = p.id
  where au.email is null or au.email not like '%@example.com'
 ), member_workouts as (
  select w.id, w.user_id, w.performed_at, date_trunc('week', w.performed_at at time zone 'Asia/Tokyo')::date as week
  from public.workouts w join members m on m.id = w.user_id
 ), weeks as (
  select (this_week - 7 * n) as week from generate_series(0, 11) n
 )
 select jsonb_build_object(
  'total_users', (select count(*) from members),
  'active_7d', (select count(distinct mw.user_id) from member_workouts mw where mw.performed_at > now() - interval '7 days' and mw.performed_at <= now()),
  'active_30d', (select count(distinct mw.user_id) from member_workouts mw where mw.performed_at > now() - interval '30 days' and mw.performed_at <= now()),
  'weeks', (select jsonb_agg(jsonb_build_object(
     'week_start', to_char(k.week, 'YYYY-MM-DD'),
     'active_users', (select count(distinct mw.user_id) from member_workouts mw where mw.week = k.week),
     'workouts', (select count(*) from member_workouts mw where mw.week = k.week),
     'sets', (select count(*) from public.workout_sets s join member_workouts mw on mw.id = s.workout_id where mw.week = k.week),
     'signups', (select count(*) from members m where m.signup_week = k.week)
    ) order by k.week) from weeks k)
 ) into result;
 return result;
end $$;
revoke all on function public.admin_usage_stats() from public, anon;
grant execute on function public.admin_usage_stats() to authenticated;
commit;
