-- New-feature announcements live in the app's code; this records, per user, the time up to
-- which they have been seen. Without a row the baseline is the signup time, so new users never
-- get a backlog. The time written is always the server's now().
begin;
create table public.announcement_reads (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  seen_until timestamptz not null default now()
);
alter table public.announcement_reads enable row level security;
revoke all on public.announcement_reads from anon, authenticated;
grant select on public.announcement_reads to authenticated;
grant insert (user_id) on public.announcement_reads to authenticated;
grant update (seen_until) on public.announcement_reads to authenticated;
create policy announcement_reads_select_own on public.announcement_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy announcement_reads_insert_own on public.announcement_reads for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy announcement_reads_update_own on public.announcement_reads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.announcement_reads_now() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.seen_until := now();
 return new;
end $$;
revoke all on function public.announcement_reads_now() from public, anon, authenticated;
create trigger announcement_reads_now before insert or update on public.announcement_reads
  for each row execute function public.announcement_reads_now();

create or replace function public.announcements_seen_until() returns timestamptz
language sql stable security invoker set search_path = '' as $$
 select coalesce(
  (select r.seen_until from public.announcement_reads r where r.user_id = auth.uid()),
  (select p.created_at from public.profiles p where p.id = auth.uid()))
$$;

create or replace function public.mark_announcements_seen() returns void
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 insert into public.announcement_reads(user_id) values (auth.uid())
  on conflict (user_id) do update set seen_until = now();
end $$;

revoke all on function public.announcements_seen_until(), public.mark_announcements_seen() from public, anon;
grant execute on function public.announcements_seen_until(), public.mark_announcements_seen() to authenticated;
commit;
