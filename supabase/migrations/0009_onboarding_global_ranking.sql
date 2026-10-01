begin;
alter table public.profiles add column if not exists icon text not null default 'initials';
alter table public.community_profiles add column if not exists global_ranking boolean not null default false;
alter table public.community_profiles drop constraint if exists community_profiles_icon_check;
alter table public.community_profiles add constraint community_profiles_icon_check check(icon in ('initials','barbell','target','bolt','💪','🔥','🏋️','🐻','🐱','⚡'));
alter table public.community_profiles alter column icon set default 'initials';
create or replace function public.save_glog_profile(p_name text,p_icon text,p_bio text,p_global boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 if char_length(trim(p_name)) not between 1 and 30 or p_icon not in ('initials','barbell','target','bolt') or char_length(p_bio)>100 then raise exception 'プロフィールの入力内容を確認してください'; end if;
 insert into public.community_profiles(user_id,display_name,icon,bio,global_ranking) values(auth.uid(),trim(p_name),p_icon,trim(p_bio),p_global)
 on conflict(user_id) do update set display_name=excluded.display_name,icon=excluded.icon,bio=excluded.bio,global_ranking=excluded.global_ranking;
 update public.profiles set display_name=trim(p_name),icon=p_icon where id=auth.uid();
end $$;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare n text; i text;
begin
 n:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Glogユーザー'),30);
 i:=coalesce(new.raw_user_meta_data->>'profile_icon','initials');
 if i not in ('initials','barbell','target','bolt') then i:='initials'; end if;
 insert into public.profiles(id,display_name,icon) values(new.id,n,i);
 insert into public.community_profiles(user_id,display_name,icon) values(new.id,n,i);
 return new;
end $$;
create or replace function public.global_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 with members as (
   select user_id from public.community_profiles where global_ranking
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
   select user_id,jsonb_object_agg(lift,value) lifts,
     case when count(value)=3 then sum(value) end total,
     case when count(baseline)=3 then sum(value)-sum(baseline) end growth
   from best group by user_id
 ), daily as (
   select user_id,lift,record_date,max(value) value from records group by user_id,lift,record_date
 ), series as (
   select user_id,jsonb_agg(jsonb_build_object('lift',lift,'date',record_date,'value',value) order by record_date,lift) points
   from daily group by user_id
 ) select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio','',
   'lifts',t.lifts,'total',t.total,'growth',t.growth,'points','[]'::jsonb) order by t.total desc nulls last,p.user_id),'[]'::jsonb)
 into result from totals t join public.community_profiles p on p.user_id=t.user_id left join series s on s.user_id=t.user_id;
 return result;
end $$;

revoke all on function public.global_ranking(), public.save_glog_profile(text,text,text,boolean) from public,anon;
grant execute on function public.global_ranking(), public.save_glog_profile(text,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
