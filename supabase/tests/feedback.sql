-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('f0000000-0000-4000-8000-00000000000a', 'sender@example.com', '{"display_name":"送る人"}'),
 ('f0000000-0000-4000-8000-00000000000b', 'other@example.com', '{"display_name":"別の人"}'),
 ('f0000000-0000-4000-8000-00000000000c', 'admin@example.com', '{"display_name":"運営"}');
insert into public.admins(user_id) values ('f0000000-0000-4000-8000-00000000000c');
-- An old note from A that no longer counts toward the 24-hour limit.
insert into public.feedback(user_id, body, created_at) values
 ('f0000000-0000-4000-8000-00000000000a', '昔の意見', now() - interval '25 hours');

-- anon can run none of the admin functions or touch the tables; authenticated can run the functions.
do $$ begin
  if has_function_privilege('anon', 'public.admin_list_feedback()', 'execute')
    or has_function_privilege('anon', 'public.admin_unread_feedback_count()', 'execute')
    or has_function_privilege('anon', 'public.admin_mark_feedback_read(uuid)', 'execute') then
    raise exception 'anon can run admin feedback functions'; end if;
  if not has_function_privilege('authenticated', 'public.admin_list_feedback()', 'execute')
    or not has_function_privilege('authenticated', 'public.admin_unread_feedback_count()', 'execute')
    or not has_function_privilege('authenticated', 'public.admin_mark_feedback_read(uuid)', 'execute') then
    raise exception 'authenticated cannot run admin feedback functions'; end if;
  if has_table_privilege('anon', 'public.feedback', 'select') or has_column_privilege('anon', 'public.feedback', 'body', 'insert')
    or has_table_privilege('anon', 'public.admins', 'select') then
    raise exception 'anon can touch feedback tables'; end if;
end $$;

set local role authenticated;

-- Signed out: listing and marking refuse, the count is zero.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform * from public.admin_list_feedback(); raise exception 'listed signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
  begin perform public.admin_mark_feedback_read(gen_random_uuid()); raise exception 'marked signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
  if public.admin_unread_feedback_count() <> 0 then raise exception 'signed-out count is not zero'; end if;
end $$;

-- A sends a note and reads it back; the sender is filled in.
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-00000000000a', true);
insert into public.feedback(body, user_agent) values ('グラフが見にくい', 'TestAgent');
do $$ begin
  if (select count(*) from public.feedback) <> 2 then raise exception 'sender cannot read own feedback'; end if;
  if exists (select 1 from public.feedback where user_id <> 'f0000000-0000-4000-8000-00000000000a') then
    raise exception 'sender was not filled in'; end if;
end $$;

-- A cannot choose the sender, time or read mark, change or delete notes, or become an admin.
do $$ begin
  begin insert into public.feedback(user_id, body) values ('f0000000-0000-4000-8000-00000000000b', 'なりすまし'); raise exception 'chose another sender';
  exception when insufficient_privilege then null; end;
  begin insert into public.feedback(body, read_at) values ('既読付き', now()); raise exception 'set read_at';
  exception when insufficient_privilege then null; end;
  begin insert into public.feedback(body, created_at) values ('過去の日時', now() - interval '2 days'); raise exception 'set created_at';
  exception when insufficient_privilege then null; end;
  begin update public.feedback set body = '書き換え'; raise exception 'updated feedback';
  exception when insufficient_privilege then null; end;
  begin delete from public.feedback; raise exception 'deleted feedback';
  exception when insufficient_privilege then null; end;
  begin insert into public.admins(user_id) values ('f0000000-0000-4000-8000-00000000000a'); raise exception 'became admin';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.admins) <> 0 then raise exception 'non-admin sees admins'; end if;
end $$;

-- Blank (including full-width spaces and newlines) and over-long bodies are refused; 2000 characters pass.
do $$ begin
  begin insert into public.feedback(body) values (E' \n　\t'); raise exception 'blank accepted';
  exception when check_violation then null; end;
  begin insert into public.feedback(body) values (repeat('あ', 2001)); raise exception '2001 characters accepted';
  exception when check_violation then null; end;
  begin insert into public.feedback(body, user_agent) values ('長いUA', repeat('a', 501)); raise exception 'long user agent accepted';
  exception when check_violation then null; end;
end $$;
insert into public.feedback(body) values (repeat('あ', 2000));

-- A non-admin cannot list or mark, and sees a zero count.
do $$ begin
  begin perform * from public.admin_list_feedback(); raise exception 'non-admin listed';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
  begin perform public.admin_mark_feedback_read(gen_random_uuid()); raise exception 'non-admin marked';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
  if public.admin_unread_feedback_count() <> 0 then raise exception 'non-admin count is not zero'; end if;
end $$;

-- Ten notes within 24 hours are accepted; the eleventh is refused. The old note does not count.
do $$ begin
  for i in 1..8 loop insert into public.feedback(body) values ('連投' || i); end loop;
  begin insert into public.feedback(body) values ('11件目'); raise exception 'eleventh note accepted';
  exception when raise_exception then if sqlerrm <> '送信の上限に達しました。時間をおいてお試しください' then raise; end if; end;
end $$;

-- B sees none of A's notes.
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-00000000000b', true);
do $$ begin
  if (select count(*) from public.feedback) <> 0 then raise exception 'another user reads A''s feedback'; end if;
end $$;

-- The admin lists every note with the sender's name, marks one read (twice is harmless),
-- and still cannot read the table directly.
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-00000000000c', true);
do $$ declare r record; n int; begin
  if public.admin_unread_feedback_count() <> 11 then raise exception 'unexpected unread count %', public.admin_unread_feedback_count(); end if;
  select count(*) into n from public.admin_list_feedback();
  if n <> 11 then raise exception 'admin listed % notes', n; end if;
  if (select body from public.admin_list_feedback() limit 1) = '昔の意見' then raise exception 'list is not newest first'; end if;
  select * into r from public.admin_list_feedback() where body = 'グラフが見にくい';
  if r.display_name <> '送る人' or r.user_agent <> 'TestAgent' or r.read_at is not null then raise exception 'unexpected row %', r; end if;
  perform public.admin_mark_feedback_read(r.id);
  perform public.admin_mark_feedback_read(r.id);
  if public.admin_unread_feedback_count() <> 10 then raise exception 'marking did not lower the count'; end if;
  if (select read_at from public.admin_list_feedback() where id = r.id) is null then raise exception 'read mark missing'; end if;
  if (select count(*) from public.feedback) <> 0 then raise exception 'admin reads the feedback table directly'; end if;
  if (select count(*) from public.admins) <> 1 then raise exception 'admin cannot see own admin row'; end if;
end $$;

-- A sees that the operator read the note.
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-00000000000a', true);
do $$ begin
  if (select read_at from public.feedback where body = 'グラフが見にくい') is null then raise exception 'sender cannot see the read mark'; end if;
end $$;

-- Leaving removes A's notes; removing the admin's account removes the admin row.
select public.delete_my_account('退会する');
reset role;
delete from auth.users where id = 'f0000000-0000-4000-8000-00000000000c';
do $$ begin
  if exists (select 1 from public.feedback where user_id = 'f0000000-0000-4000-8000-00000000000a') then raise exception 'feedback survived account deletion'; end if;
  if exists (select 1 from public.admins) then raise exception 'admin row survived account deletion'; end if;
end $$;
rollback;
