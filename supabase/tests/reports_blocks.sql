-- Synthetic fixtures only; the entire suite is rolled back.
-- a: reporter (global ranking)、b: target (global ranking)、c: hidden from a、d: shares a community with a、e: admin
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('a7000000-0000-4000-8000-00000000000a', 'rb-a@example.com', '{"display_name":"通報する人","global_ranking":"true"}'),
 ('a7000000-0000-4000-8000-00000000000b', 'rb-b@example.com', '{"display_name":"ベンチ太郎","global_ranking":"true"}'),
 ('a7000000-0000-4000-8000-00000000000c', 'rb-c@example.com', '{"display_name":"見えない人"}'),
 ('a7000000-0000-4000-8000-00000000000d', 'rb-d@example.com', '{"display_name":"仲間"}'),
 ('a7000000-0000-4000-8000-00000000000e', 'rb-e@example.com', '{"display_name":"運営"}'),
 -- 禁止語の名前で登録しても、登録は止めずに初期の名前にする
 ('a7000000-0000-4000-8000-00000000000f', 'rb-f@example.com', '{"display_name":"ｷﾁｶﾞｲ"}');
insert into public.admins(user_id) values ('a7000000-0000-4000-8000-00000000000e');
update public.community_profiles set bio = '毎日ベンチ' where user_id = 'a7000000-0000-4000-8000-00000000000b';

do $$ begin
  if (select display_name from public.community_profiles where user_id = 'a7000000-0000-4000-8000-00000000000f') <> 'Glogユーザー'
    or (select display_name from public.profiles where id = 'a7000000-0000-4000-8000-00000000000f') <> 'Glogユーザー' then
    raise exception 'banned signup name was kept'; end if;
  if public.ban_normalize('Ｆ Ｕ・Ｃ Ｋ') <> 'fuck' or public.ban_normalize('ｾｯｸｽ') <> 'せっくす' then
    raise exception 'normalization differs: %', public.ban_normalize('ｾｯｸｽ'); end if;
  -- 新しく足した語も、そろえた形で保存される
  insert into public.banned_words(word) values ('テスト禁止ワード');
  if not exists (select 1 from public.banned_words where word = 'てすと禁止わーど') then raise exception 'word not normalized'; end if;
  -- 名前の境目に当たる語は入れていない（「ちん こうへい」「カチンコチン」）
  if public.has_banned_word('ちんこうへい') or public.has_banned_word('かチンコちん') or not public.has_banned_word('オマンコ') then
    raise exception 'word list hits a name boundary'; end if;
end $$;

-- Privileges: anon runs nothing; helpers and tables are closed to signed-in people too.
do $$ declare f text; begin
  foreach f in array array['public.report_user(uuid, text, text)', 'public.block_user(uuid)', 'public.unblock_user(uuid)',
    'public.list_blocked_users()', 'public.admin_list_reports()', 'public.admin_open_report_count()',
    'public.admin_resolve_report(uuid, text)', 'public.global_ranking()', 'public.community_ranking(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'anon can run %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'authenticated cannot run %', f; end if;
  end loop;
  foreach f in array array['public.has_banned_word(text)', 'public.can_see_member(uuid, uuid)', 'public.ban_normalize(text)'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'helper % is callable', f; end if;
  end loop;
  foreach f in array array['public.user_reports', 'public.user_blocks', 'public.banned_words'] loop
    if has_table_privilege('authenticated', f, 'select') or has_table_privilege('authenticated', f, 'insert')
      or has_table_privilege('anon', f, 'select') then raise exception '% is readable or writable', f; end if;
  end loop;
end $$;

-- a and d share a community.
insert into public.communities(id, owner_id, name) values
 ('a7000000-0000-4000-8000-0000000000c1', 'a7000000-0000-4000-8000-00000000000a', 'ジム仲間');
insert into public.community_members(community_id, user_id) values
 ('a7000000-0000-4000-8000-0000000000c1', 'a7000000-0000-4000-8000-00000000000a'),
 ('a7000000-0000-4000-8000-0000000000c1', 'a7000000-0000-4000-8000-00000000000d');

set local role authenticated;

-- Banned words: through the save function, directly on the table, and in a community name.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000a', true);
do $$ begin
  begin perform public.save_glog_profile('ｷﾁｶﾞｲ', 'muscle', '', true); raise exception 'half-width banned name saved';
  exception when raise_exception then if sqlerrm <> '使えない言葉が含まれています' then raise; end if; end;
  begin perform public.save_glog_profile('通報する人', 'muscle', '死 ね', true); raise exception 'spaced banned bio saved';
  exception when raise_exception then if sqlerrm <> '使えない言葉が含まれています' then raise; end if; end;
  begin update public.community_profiles set display_name = 'レ イ プ' where user_id = 'a7000000-0000-4000-8000-00000000000a';
    raise exception 'direct update saved a banned name';
  exception when raise_exception then if sqlerrm <> '使えない言葉が含まれています' then raise; end if; end;
  begin perform public.community_manage('create', 'セックス部', null); raise exception 'banned community name saved';
  exception when raise_exception then if sqlerrm <> '使えない言葉が含まれています' then raise; end if; end;
  perform public.save_glog_profile('通報する人', 'muscle', 'デッドリフトが好き', true);
end $$;

-- A word added later does not block saving other fields under an existing name.
reset role;
insert into public.banned_words(word) values ('通報する');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000a', true);
update public.community_profiles set dots_opt_in = false where user_id = 'a7000000-0000-4000-8000-00000000000a';
-- The profile screen saves with insert … on conflict: an unchanged name must still save (icon, bio, ranking).
select public.save_glog_profile('通報する人', 'barbell', 'デッドリフトが好き', true);
do $$ begin
  begin perform public.save_glog_profile('通報する人2', 'barbell', '', true); raise exception 'changed banned name saved';
  exception when raise_exception then if sqlerrm <> '使えない言葉が含まれています' then raise; end if; end;
end $$;
reset role;
delete from public.banned_words where word = '通報する';
set local role authenticated;

-- Reports: only people on the reporter's screen, never oneself, with a reason and a short detail.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.report_user('a7000000-0000-4000-8000-00000000000b', 'name', ''); raise exception 'reported signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000a', true);
do $$ declare t uuid; begin
  foreach t in array array['a7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-00000000000c', gen_random_uuid()]::uuid[] loop
    begin perform public.report_user(t, 'name', ''); raise exception 'reported %', t;
    exception when raise_exception then if sqlerrm <> 'この操作はできません' then raise; end if; end;
  end loop;
  begin perform public.report_user('a7000000-0000-4000-8000-00000000000b', 'spam', ''); raise exception 'unknown reason accepted';
  exception when raise_exception then if sqlerrm <> '理由を選んでください' then raise; end if; end;
  begin perform public.report_user('a7000000-0000-4000-8000-00000000000b', 'name', repeat('あ', 501)); raise exception 'long detail accepted';
  exception when raise_exception then if sqlerrm <> '詳細は500文字までです' then raise; end if; end;
  perform public.report_user('a7000000-0000-4000-8000-00000000000b', 'name', '');
  perform public.report_user('a7000000-0000-4000-8000-00000000000b', 'bio', '  ひとことが不快です ');
  perform public.report_user('a7000000-0000-4000-8000-00000000000d', 'photo', '');
end $$;

-- b renames after being reported: the admin still sees what was reported.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000b', true);
select public.save_glog_profile('ベンチ次郎', 'muscle', '毎日ベンチ', true);

-- Admin: others are refused (the count is 0 for them), the admin sees one merged report per pair.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000a', true);
do $$ begin
  begin perform public.admin_list_reports(); raise exception 'non-admin listed reports';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
  begin perform public.admin_resolve_report('a7000000-0000-4000-8000-00000000000b', 'dismiss'); raise exception 'non-admin resolved';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
  if public.admin_open_report_count() <> 0 then raise exception 'non-admin sees a count'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000e', true);
do $$ declare r record; begin
  if public.admin_open_report_count() <> 2 then raise exception 'open count %', public.admin_open_report_count(); end if;
  select * into r from public.admin_list_reports() where target_id = 'a7000000-0000-4000-8000-00000000000b';
  if r.reason <> 'bio' or r.detail <> 'ひとことが不快です' or r.reporter_name <> '通報する人'
    or r.snapshot->>'display_name' <> 'ベンチ太郎' or r.snapshot->>'bio' <> '毎日ベンチ'
    or r.target_name <> 'ベンチ次郎' or not r.target_global or r.resolved_at is not null then
    raise exception 'unexpected report row %', row_to_json(r); end if;
  if (select count(*) from public.admin_list_reports()) <> 2 then raise exception 'reports were not merged'; end if;
  begin perform public.admin_resolve_report('a7000000-0000-4000-8000-00000000000b', 'ban'); raise exception 'unknown action accepted';
  exception when raise_exception then if sqlerrm <> '操作を選んでください' then raise; end if; end;
  begin perform public.admin_resolve_report('a7000000-0000-4000-8000-00000000000c', 'dismiss'); raise exception 'resolved nothing';
  exception when raise_exception then if sqlerrm <> '未対応の通報が見つかりません' then raise; end if; end;
  if public.admin_resolve_report('a7000000-0000-4000-8000-00000000000d', 'dismiss') <> 1 then raise exception 'dismiss count'; end if;
  if public.admin_resolve_report('a7000000-0000-4000-8000-00000000000b', 'remove') <> 1 then raise exception 'remove count'; end if;
  select * into r from public.admin_list_reports() where target_id = 'a7000000-0000-4000-8000-00000000000b';
  if r.resolution <> 'removed' or r.resolved_at is null or r.target_name <> 'Glogユーザー' or r.target_icon <> 'muscle'
    or r.target_bio <> '' or r.target_global then raise exception 'remove did not reset %', row_to_json(r); end if;
  if (select resolution from public.admin_list_reports() where target_id = 'a7000000-0000-4000-8000-00000000000d') <> 'dismissed' then
    raise exception 'dismiss changed nothing'; end if;
  if public.admin_open_report_count() <> 0 then raise exception 'reports still open'; end if;
end $$;
reset role;
do $$ begin
  if (select display_name from public.profiles where id = 'a7000000-0000-4000-8000-00000000000b') <> 'Glogユーザー' then
    raise exception 'profiles kept the old name'; end if;
  if (select display_name from public.community_profiles where user_id = 'a7000000-0000-4000-8000-00000000000d') <> '仲間' then
    raise exception 'dismiss changed the profile'; end if;
  update public.community_profiles set global_ranking = true where user_id = 'a7000000-0000-4000-8000-00000000000b';
end $$;
set local role authenticated;

-- Blocks are one-way: they hide the other person from the blocker's rankings only.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000a', true);
do $$ declare t uuid; ids jsonb; begin
  foreach t in array array['a7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-00000000000c']::uuid[] loop
    begin perform public.block_user(t); raise exception 'blocked %', t;
    exception when raise_exception then if sqlerrm <> 'この操作はできません' then raise; end if; end;
  end loop;
  perform public.block_user('a7000000-0000-4000-8000-00000000000b');
  perform public.block_user('a7000000-0000-4000-8000-00000000000b');
  perform public.block_user('a7000000-0000-4000-8000-00000000000d');
  select jsonb_agg(m->>'user_id') into ids from jsonb_array_elements(public.global_ranking()) m;
  if ids ? 'a7000000-0000-4000-8000-00000000000b' or not ids ? 'a7000000-0000-4000-8000-00000000000a' then
    raise exception 'global ranking after block %', ids; end if;
  select jsonb_agg(m->>'user_id') into ids from jsonb_array_elements(public.community_ranking('a7000000-0000-4000-8000-0000000000c1')) m;
  if ids ? 'a7000000-0000-4000-8000-00000000000d' or not ids ? 'a7000000-0000-4000-8000-00000000000a' then
    raise exception 'community ranking after block %', ids; end if;
  if (select array_agg(user_id order by user_id) from public.list_blocked_users())
    <> array['a7000000-0000-4000-8000-00000000000b', 'a7000000-0000-4000-8000-00000000000d']::uuid[] then
    raise exception 'blocked list differs'; end if;
end $$;
-- The blocked person still sees the blocker, and does not see a's list.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000d', true);
do $$ declare ids jsonb; begin
  select jsonb_agg(m->>'user_id') into ids from jsonb_array_elements(public.community_ranking('a7000000-0000-4000-8000-0000000000c1')) m;
  if not ids ? 'a7000000-0000-4000-8000-00000000000a' then raise exception 'block hid the blocker'; end if;
  if exists (select 1 from public.list_blocked_users()) then raise exception 'saw another list'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000a', true);
select public.unblock_user('a7000000-0000-4000-8000-00000000000b');
do $$ begin
  if not exists (select 1 from jsonb_array_elements(public.global_ranking()) m where m->>'user_id' = 'a7000000-0000-4000-8000-00000000000b') then
    raise exception 'unblock did not bring b back'; end if;
end $$;

-- At most 20 reports a day.
reset role;
insert into public.user_reports(reporter_id, target_id, reason, snapshot, resolved_at, resolution)
select 'a7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-00000000000b', 'other', '{}', now(), 'dismissed'
from generate_series(1, 20);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-00000000000a', true);
do $$ begin
  begin perform public.report_user('a7000000-0000-4000-8000-00000000000b', 'name', ''); raise exception 'limit not applied';
  exception when raise_exception then if sqlerrm <> '通報の上限に達しました。時間をおいてお試しください' then raise; end if; end;
end $$;

-- Leaving the service removes both sides' reports and blocks.
select public.block_user('a7000000-0000-4000-8000-00000000000b');
reset role;
do $$ begin
  if not exists (select 1 from public.user_blocks where blocked_id = 'a7000000-0000-4000-8000-00000000000b') then
    raise exception 'block before deletion missing'; end if;
end $$;
delete from auth.users where id = 'a7000000-0000-4000-8000-00000000000b';
do $$ begin
  if exists (select 1 from public.user_reports where target_id = 'a7000000-0000-4000-8000-00000000000b')
    or exists (select 1 from public.user_blocks where blocked_id = 'a7000000-0000-4000-8000-00000000000b') then
    raise exception 'rows about a deleted user remain'; end if;
end $$;
rollback;
