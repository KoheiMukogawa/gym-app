-- In-app feedback: users send notes that only operators read. Operators are listed in
-- public.admins (added from the SQL Editor) and read or mark notes through the admin_* functions,
-- because profiles are readable only by their owner.
begin;
create table public.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
create policy admins_select_own on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 2000 and btrim(body, E' \t\r\n　') <> ''),
  user_agent text check (char_length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);
create index feedback_unread_idx on public.feedback (created_at desc) where read_at is null;
alter table public.feedback enable row level security;
-- Users may only supply the text: the sender, time and read mark come from the database.
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (body, user_agent) on public.feedback to authenticated;
create policy feedback_insert_own on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and read_at is null);
create policy feedback_select_own on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.feedback_rate_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
 if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 10 then
  raise exception '送信の上限に達しました。時間をおいてお試しください';
 end if;
 return new;
end $$;
revoke all on function public.feedback_rate_limit() from public, anon, authenticated;
create trigger feedback_rate_limit before insert on public.feedback
  for each row execute function public.feedback_rate_limit();

create or replace function public.admin_list_feedback()
returns table (id uuid, body text, user_agent text, created_at timestamptz, read_at timestamptz, display_name text)
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 return query select f.id, f.body, f.user_agent, f.created_at, f.read_at, p.display_name
  from public.feedback f join public.profiles p on p.id = f.user_id
  order by f.created_at desc, f.id desc limit 200;
end $$;

-- Zero for everyone but admins: the profile screen asks on every visit.
create or replace function public.admin_unread_feedback_count() returns integer
language sql stable security definer set search_path = '' as $$
 select case when exists (select 1 from public.admins a where a.user_id = auth.uid())
  then (select count(*)::integer from public.feedback f where f.read_at is null) else 0 end
$$;

create or replace function public.admin_mark_feedback_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 update public.feedback set read_at = now() where id = p_id and read_at is null;
end $$;

revoke all on function public.admin_list_feedback(), public.admin_unread_feedback_count(), public.admin_mark_feedback_read(uuid) from public, anon;
grant execute on function public.admin_list_feedback(), public.admin_unread_feedback_count(), public.admin_mark_feedback_read(uuid) to authenticated;
commit;
