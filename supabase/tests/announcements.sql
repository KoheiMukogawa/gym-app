-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('a0000000-0000-4000-8000-00000000000a', 'a@glog.test', '{"display_name":"A"}'),
 ('a0000000-0000-4000-8000-00000000000b', 'b@glog.test', '{"display_name":"B"}');
update public.profiles set created_at = '2026-09-01T00:00:00Z' where id = 'a0000000-0000-4000-8000-00000000000a';

do $$ begin
  if has_function_privilege('anon', 'public.announcements_seen_until()', 'execute')
    or has_function_privilege('anon', 'public.mark_announcements_seen()', 'execute')
    or has_table_privilege('anon', 'public.announcement_reads', 'select') then
    raise exception 'anon can reach announcement reads'; end if;
  if not has_function_privilege('authenticated', 'public.announcements_seen_until()', 'execute')
    or not has_function_privilege('authenticated', 'public.mark_announcements_seen()', 'execute') then
    raise exception 'authenticated cannot run announcement functions'; end if;
end $$;

set local role authenticated;

-- Signed out: no baseline, and marking refuses.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if public.announcements_seen_until() is not null then raise exception 'signed-out baseline is not null'; end if;
  begin perform public.mark_announcements_seen(); raise exception 'marked signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;

-- A without a row: the baseline is the signup time. Marking records the server time, twice is fine.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true);
do $$ begin
  if public.announcements_seen_until() <> '2026-09-01T00:00:00Z'::timestamptz then raise exception 'baseline is not the signup time'; end if;
  perform public.mark_announcements_seen();
  perform public.mark_announcements_seen();
  if public.announcements_seen_until() <> now() then raise exception 'marking did not record now()'; end if;
  if (select count(*) from public.announcement_reads) <> 1 then raise exception 'expected one row'; end if;
end $$;

-- Writing a chosen time directly still records now(); another user's row cannot be created or deleted.
do $$ begin
  update public.announcement_reads set seen_until = '2099-01-01T00:00:00Z';
  if (select seen_until from public.announcement_reads) <> now() then raise exception 'a chosen time was kept'; end if;
  begin insert into public.announcement_reads(user_id) values ('a0000000-0000-4000-8000-00000000000b'); raise exception 'created another user''s row';
  exception when insufficient_privilege then null; end;
  begin insert into public.announcement_reads(user_id, seen_until) values ('a0000000-0000-4000-8000-00000000000a', now()); raise exception 'chose seen_until on insert';
  exception when insufficient_privilege then null; end;
  begin delete from public.announcement_reads; raise exception 'deleted a row';
  exception when insufficient_privilege then null; end;
end $$;

-- B cannot see A's row and still gets B's own signup time.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000b', true);
do $$ begin
  if (select count(*) from public.announcement_reads) <> 0 then raise exception 'B reads A''s row'; end if;
  if public.announcements_seen_until() <> (select created_at from public.profiles where id = 'a0000000-0000-4000-8000-00000000000b') then
    raise exception 'B baseline is not B''s signup time'; end if;
end $$;

-- Leaving removes A's row.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true);
select public.delete_my_account('退会する');
reset role;
do $$ begin
  if exists (select 1 from public.announcement_reads where user_id = 'a0000000-0000-4000-8000-00000000000a') then
    raise exception 'announcement read survived account deletion'; end if;
end $$;
rollback;
