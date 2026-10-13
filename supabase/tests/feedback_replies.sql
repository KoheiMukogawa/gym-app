-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('f1000000-0000-4000-8000-00000000000a', 'sender@example.com', '{"display_name":"送る人"}'),
 ('f1000000-0000-4000-8000-00000000000b', 'other@example.com', '{"display_name":"別の人"}'),
 ('f1000000-0000-4000-8000-00000000000c', 'admin@example.com', '{"display_name":"運営"}');
insert into public.admins(user_id) values ('f1000000-0000-4000-8000-00000000000c');
insert into public.feedback(id, user_id, body) values
 ('f1000000-0000-4000-8000-0000000000f1', 'f1000000-0000-4000-8000-00000000000a', '1kg刻みにしてほしい'),
 ('f1000000-0000-4000-8000-0000000000f2', 'f1000000-0000-4000-8000-00000000000b', '別の人の意見');

do $$ begin
  if has_function_privilege('anon', 'public.admin_reply_feedback(uuid, text, text)', 'execute')
    or has_function_privilege('anon', 'public.mark_my_feedback_replies_seen()', 'execute')
    or has_function_privilege('anon', 'public.admin_list_feedback()', 'execute') then
    raise exception 'anon can run feedback reply functions'; end if;
  if not has_function_privilege('authenticated', 'public.admin_reply_feedback(uuid, text, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.mark_my_feedback_replies_seen()', 'execute') then
    raise exception 'authenticated cannot run feedback reply functions'; end if;
end $$;

set local role authenticated;

-- Signed out: neither function runs.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', 'done', 'x'); raise exception 'replied signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
  begin perform public.mark_my_feedback_replies_seen(); raise exception 'marked signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;

-- The sender can neither answer nor write the answer columns directly.
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-00000000000a', true);
do $$ begin
  begin perform public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', 'done', '自分で返信'); raise exception 'non-admin replied';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
  begin update public.feedback set reply = '書き換え', status = 'done'; raise exception 'updated reply';
  exception when insufficient_privilege then null; end;
  begin update public.feedback set reply_seen_at = now(); raise exception 'updated seen mark';
  exception when insufficient_privilege then null; end;
  begin insert into public.feedback(body, status, reply) values ('自作の返信付き', 'done', 'x'); raise exception 'inserted an answer';
  exception when insufficient_privilege then null; end;
end $$;

-- The admin answers: status is required, blank replies are stored as none, long ones are refused,
-- answering marks the note read, and saving the same answer again keeps its time.
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-00000000000c', true);
do $$ declare first_at timestamptz; again_at timestamptz; r record; begin
  begin perform public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', null, '返信'); raise exception 'no status accepted';
  exception when raise_exception then if sqlerrm <> '状態を選んでください' then raise; end if; end;
  begin perform public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', 'maybe', '返信'); raise exception 'unknown status accepted';
  exception when raise_exception then if sqlerrm <> '状態を選んでください' then raise; end if; end;
  begin perform public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', 'done', repeat('あ', 1001)); raise exception 'long reply accepted';
  exception when raise_exception then if sqlerrm <> '返信は1000文字までです' then raise; end if; end;
  begin perform public.admin_reply_feedback(gen_random_uuid(), 'done', '返信'); raise exception 'missing note accepted';
  exception when raise_exception then if sqlerrm <> '意見が見つかりません' then raise; end if; end;

  first_at := public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', 'in_progress', E'  \n　');
  select * into r from public.admin_list_feedback() where id = 'f1000000-0000-4000-8000-0000000000f1';
  if r.status <> 'in_progress' or r.reply is not null or r.replied_at is null or r.read_at is null then raise exception 'unexpected answer %', r; end if;
  again_at := public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', 'in_progress', null);
  if again_at <> first_at then raise exception 'unchanged answer moved its time'; end if;
end $$;

-- The sender sees the answer and marks it seen; another user's note is untouched.
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-00000000000a', true);
do $$ begin
  if (select status from public.feedback where id = 'f1000000-0000-4000-8000-0000000000f1') <> 'in_progress' then raise exception 'sender cannot see status'; end if;
  perform public.mark_my_feedback_replies_seen();
  if (select reply_seen_at from public.feedback where id = 'f1000000-0000-4000-8000-0000000000f1') is null then raise exception 'not marked seen'; end if;
end $$;

-- A changed answer counts as new again: replied_at moves past the seen mark.
-- (now() is fixed inside one transaction, so the seen mark is pushed back to compare.)
reset role;
update public.feedback set reply_seen_at = reply_seen_at - interval '1 minute', replied_at = replied_at - interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-00000000000c', true);
select public.admin_reply_feedback('f1000000-0000-4000-8000-0000000000f1', 'done', '1kg刻みに対応しました');
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-00000000000a', true);
do $$ declare r record; begin
  select * into r from public.feedback where id = 'f1000000-0000-4000-8000-0000000000f1';
  if r.reply <> '1kg刻みに対応しました' or not (r.reply_seen_at < r.replied_at) then raise exception 'changed answer not shown as new %', r; end if;
  perform public.mark_my_feedback_replies_seen();
  if (select reply_seen_at < replied_at from public.feedback where id = 'f1000000-0000-4000-8000-0000000000f1') then raise exception 'still unseen'; end if;
end $$;
reset role;
do $$ begin
  if (select reply_seen_at from public.feedback where id = 'f1000000-0000-4000-8000-0000000000f2') is not null then raise exception 'marked another user''s note'; end if;
end $$;
rollback;
