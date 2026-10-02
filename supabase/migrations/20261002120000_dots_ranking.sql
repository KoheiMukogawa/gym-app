begin;
alter table public.community_profiles
  add column if not exists dots_opt_in boolean not null default false,
  add column if not exists dots_formula text;
alter table public.community_profiles drop constraint if exists community_profiles_dots_formula_check;
alter table public.community_profiles add constraint community_profiles_dots_formula_check
  check ((dots_formula is null or dots_formula in ('male','female')) and (not dots_opt_in or dots_formula is not null));

-- DOTS = kg x 500 / poly4(bodyweight). Coefficients and bodyweight bounds follow OpenPowerlifting.
create or replace function public.dots_points(p_kg numeric, p_bodyweight numeric, p_formula text) returns numeric
language sql immutable set search_path = '' as $$
 select p_kg*500/case p_formula
   when 'male' then -307.75076+24.0900756*b-0.1918759221*b^2+0.0007391293*b^3-0.000001093*b^4
   when 'female' then -57.96288+13.6175032*b-0.1126655495*b^2+0.0005158568*b^3-0.0000010706*b^4 end
 from (select least(greatest(p_bodyweight,40),case p_formula when 'female' then 150 else 210 end) b) x
$$;

create or replace function public.big3_member_stats(p_user_ids uuid[])
returns table(user_id uuid, lifts jsonb, total numeric, growth numeric, dots numeric, dots_opt_in boolean, points jsonb)
language sql stable security definer set search_path = '' as $$
 with members as (
   select distinct u user_id from unnest(p_user_ids) u
 ), resolved as (
   select m.user_id,k.lift,coalesce(b.exercise_id,e.id) exercise_id from members m
   cross join (values ('squat','スクワット'),('bench','ベンチプレス'),('deadlift','デッドリフト')) k(lift,label)
   left join public.big3_exercise_mappings b on b.user_id=m.user_id and b.lift_type=k.lift
   left join public.exercises e on e.is_preset and e.name_normalized=k.label
 ), records as (
   select r.user_id,r.lift,(w.performed_at at time zone 'Asia/Tokyo')::date record_date,
     round(s.weight_kg*36/(37-s.reps),1) value
   from resolved r join public.workouts w on w.user_id=r.user_id
   join public.workout_sets s on s.workout_id=w.id and s.exercise_id=r.exercise_id
   where s.reps between 1 and 10 and s.weight_kg>0 and w.performed_at<=now()
 ), best as (
   select r.user_id,r.lift,max(d.value) value,
     max(d.value) filter(where d.record_date < date_trunc('month',now() at time zone 'Asia/Tokyo')::date) baseline
   from resolved r left join records d on d.user_id=r.user_id and d.lift=r.lift group by r.user_id,r.lift
 ), totals as (
   select b.user_id,jsonb_object_agg(b.lift,b.value) lifts,
     case when count(b.value)=3 then sum(b.value) end total,
     case when count(b.baseline)=3 then sum(b.value)-sum(b.baseline) end growth
   from best b group by b.user_id
 ), weighed as (
   -- Only opted-in members get a bodyweight lookup; nobody else's weight enters the result.
   select d.user_id,d.lift,max(public.dots_points(d.value,w.bodyweight_kg,p.dots_formula)) dots
   from records d
   join public.community_profiles p on p.user_id=d.user_id and p.dots_opt_in
   cross join lateral (
     select l.bodyweight_kg from public.bodyweight_logs l
     where l.user_id=d.user_id and l.recorded_on between d.record_date-14 and d.record_date+14
     order by abs(l.recorded_on-d.record_date),l.recorded_on limit 1
   ) w
   group by d.user_id,d.lift
 ), dots_totals as (
   select w.user_id,case when count(*)=3 then round(sum(w.dots),1) end dots from weighed w group by w.user_id
 ), daily as (
   select d.user_id,d.lift,d.record_date,max(d.value) value from records d group by d.user_id,d.lift,d.record_date
 ), series as (
   select d.user_id,jsonb_agg(jsonb_build_object('lift',d.lift,'date',d.record_date,'value',d.value) order by d.record_date,d.lift) points
   from daily d group by d.user_id
 )
 select t.user_id,t.lifts,t.total,t.growth,x.dots,coalesce(p.dots_opt_in,false),coalesce(s.points,'[]'::jsonb)
 from totals t
 left join dots_totals x on x.user_id=t.user_id
 left join public.community_profiles p on p.user_id=t.user_id
 left join series s on s.user_id=t.user_id
$$;

create or replace function public.global_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio','',
   'lifts',x.lifts,'total',x.total,'growth',x.growth,'dots',x.dots,'dots_opt_in',x.dots_opt_in,'points','[]'::jsonb)
   order by x.total desc nulls last,p.user_id),'[]'::jsonb)
 into result
 from public.big3_member_stats(array(select c.user_id from public.community_profiles c where c.global_ranking)) x
 join public.community_profiles p on p.user_id=x.user_id;
 return result;
end $$;

create or replace function public.community_ranking(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.community_members where community_id=p_id and user_id=auth.uid()) then
   raise exception 'コミュニティに参加していません'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio',p.bio,
   'lifts',x.lifts,'total',x.total,'growth',x.growth,'dots',x.dots,'dots_opt_in',x.dots_opt_in,'points',x.points)
   order by x.total desc nulls last,p.user_id),'[]'::jsonb)
 into result
 from public.big3_member_stats(array(select m.user_id from public.community_members m where m.community_id=p_id)) x
 join public.community_profiles p on p.user_id=x.user_id;
 return result;
end $$;

create or replace function public.save_dots_settings(p_opt_in boolean, p_formula text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 if p_opt_in is null or (p_formula is not null and p_formula not in ('male','female')) or (p_opt_in and p_formula is null) then
   raise exception 'DOTSの係数を選んでください'; end if;
 update public.community_profiles set dots_opt_in=p_opt_in,dots_formula=coalesce(p_formula,dots_formula) where user_id=auth.uid();
 if not found then raise exception '先にプロフィールを保存してください'; end if;
end $$;

revoke all on function public.dots_points(numeric,numeric,text),public.big3_member_stats(uuid[]) from public,anon,authenticated;
revoke all on function public.global_ranking(),public.community_ranking(uuid),public.save_dots_settings(boolean,text) from public,anon;
grant execute on function public.global_ranking(),public.community_ranking(uuid),public.save_dots_settings(boolean,text) to authenticated;
commit;
