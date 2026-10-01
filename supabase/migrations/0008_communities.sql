begin;
create table if not exists public.community_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 30),
  icon text not null default '💪' check (icon in ('💪','🔥','🏋️','🐻','🐱','⚡')),
  bio text not null default '' check (char_length(bio) <= 100)
);
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  invite_code uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table if not exists public.community_members (
  community_id uuid references public.communities(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id,user_id)
);
create index if not exists community_members_user_idx on public.community_members(user_id);
alter table public.community_profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
drop policy if exists community_profiles_own on public.community_profiles;
create policy community_profiles_own on public.community_profiles for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select,insert,update on public.community_profiles to authenticated;
-- Memberships and invite codes are available only through checked RPCs.
revoke all on public.communities,public.community_members from anon,authenticated;
-- Legacy social-feed reads must not expose full logs outside a community.
drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts for select to authenticated using (user_id=auth.uid());
drop policy if exists sets_select on public.workout_sets;
create policy sets_select on public.workout_sets for select to authenticated using
  (exists(select 1 from public.workouts w where w.id=workout_id and w.user_id=auth.uid()));
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id=auth.uid());

create or replace function public.community_manage(p_action text,p_value text default '',p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c uuid; owner uuid;
begin
  if u is null then raise exception 'ログインが必要です'; end if;
  if p_action in ('create','join') and not exists(select 1 from public.community_profiles where user_id=u) then
    raise exception '先にプロフィールを保存してください'; end if;
  if p_action='create' then
    c:=coalesce(p_id,gen_random_uuid());
    insert into public.communities(id,owner_id,name) values(c,u,trim(p_value)) on conflict(id) do nothing;
    if not exists(select 1 from public.communities where id=c and owner_id=u) then raise exception 'この操作はできません'; end if;
    insert into public.community_members values(c,u,now()) on conflict do nothing; return c;
  elsif p_action='join' then
    select id into c from public.communities where invite_code::text=lower(trim(p_value));
    if c is null then raise exception '招待コードが見つかりません'; end if;
    insert into public.community_members values(c,u,now()) on conflict do nothing; return c;
  end if;
  select owner_id into owner from public.communities where id=p_id for update;
  if not exists(select 1 from public.community_members where community_id=p_id and user_id=u) then
    raise exception 'コミュニティに参加していません'; end if;
  if p_action='leave' then
    if owner=u then raise exception '作成者はコミュニティの削除を選んでください'; end if;
    delete from public.community_members where community_id=p_id and user_id=u;
  elsif p_action='rotate' and owner=u then
    update public.communities set invite_code=gen_random_uuid() where id=p_id;
  elsif p_action='delete' and owner=u then
    delete from public.communities where id=p_id;
  else raise exception 'この操作はできません'; end if;
  return p_id;
end $$;

create or replace function public.community_list() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'owner_id',c.owner_id,
  'invite_code',case when c.owner_id=auth.uid() then c.invite_code end) order by c.created_at,c.id),'[]'::jsonb)
 from public.communities c join public.community_members m on m.community_id=c.id where m.user_id=auth.uid();
$$;

create or replace function public.community_ranking(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.community_members where community_id=p_id and user_id=auth.uid()) then
   raise exception 'コミュニティに参加していません'; end if;
 with members as (
   select user_id from public.community_members where community_id=p_id
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
 ) select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio',p.bio,
   'lifts',t.lifts,'total',t.total,'growth',t.growth,'points',coalesce(s.points,'[]'::jsonb)) order by t.total desc nulls last,p.user_id),'[]'::jsonb)
 into result from totals t join public.community_profiles p on p.user_id=t.user_id left join series s on s.user_id=t.user_id;
 return result;
end $$;
revoke all on function public.community_manage(text,text,uuid),public.community_list(),public.community_ranking(uuid) from public,anon;
grant execute on function public.community_manage(text,text,uuid),public.community_list(),public.community_ranking(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
