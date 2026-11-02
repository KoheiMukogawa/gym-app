-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('b1000000-0000-4000-8000-00000000000a', 'voter@example.com', '{"display_name":"投票する人"}'),
 ('b1000000-0000-4000-8000-00000000000b', 'other@example.com', '{"display_name":"別の人"}');
insert into public.polls(id, question, starts_at, ends_at) values
 ('b1000000-0000-4000-8000-0000000000a1', '開いている投票', now() - interval '1 day', now() + interval '1 day'),
 ('b1000000-0000-4000-8000-0000000000a2', '締め切った投票', now() - interval '3 days', now() - interval '1 day'),
 ('b1000000-0000-4000-8000-0000000000a3', 'まだ始まらない投票', now() + interval '1 day', now() + interval '2 days');
insert into public.poll_options(poll_id, id, label, position) values
 ('b1000000-0000-4000-8000-0000000000a1', 'a', 'A', 1), ('b1000000-0000-4000-8000-0000000000a1', 'b', 'B', 2),
 ('b1000000-0000-4000-8000-0000000000a2', 'a', 'A', 1), ('b1000000-0000-4000-8000-0000000000a2', 'b', 'B', 2),
 ('b1000000-0000-4000-8000-0000000000a3', 'a', 'A', 1);
insert into public.poll_votes(poll_id, user_id, option_id) values
 ('b1000000-0000-4000-8000-0000000000a2', 'b1000000-0000-4000-8000-00000000000b', 'b');

do $$ begin
  if has_function_privilege('anon', 'public.list_polls()', 'execute')
    or has_function_privilege('anon', 'public.vote_poll(uuid, text)', 'execute') then
    raise exception 'anon can run poll functions'; end if;
  if has_table_privilege('anon', 'public.poll_votes', 'select') then raise exception 'anon can read votes'; end if;
  -- The first poll ships with the migration.
  if (select count(*) from public.poll_options where poll_id = 'b0110000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'name poll missing'; end if;
end $$;

set local role authenticated;

select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.list_polls(); raise exception 'listed signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
  begin perform public.vote_poll('b1000000-0000-4000-8000-0000000000a1', 'a'); raise exception 'voted signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-00000000000a', true);
do $$ declare r record; begin
  -- A poll that has not started is not listed or votable.
  if exists (select 1 from public.list_polls() where id = 'b1000000-0000-4000-8000-0000000000a3') then raise exception 'unstarted poll listed'; end if;
  if exists (select 1 from public.polls where id = 'b1000000-0000-4000-8000-0000000000a3') then raise exception 'unstarted poll readable'; end if;
  begin perform public.vote_poll('b1000000-0000-4000-8000-0000000000a3', 'a'); raise exception 'voted before start';
  exception when raise_exception then if sqlerrm <> '投票が見つかりません' then raise; end if; end;

  -- Before voting, the open poll hides its counts; the closed one shows them.
  select * into r from public.list_polls() where id = 'b1000000-0000-4000-8000-0000000000a1';
  if r.my_option is not null or r.total_votes is not null or r.options -> 0 -> 'votes' <> 'null'::jsonb then raise exception 'counts before voting %', r; end if;
  if r.options -> 0 ->> 'label' <> 'A' or r.options -> 1 ->> 'id' <> 'b' then raise exception 'options out of order %', r.options; end if;
  select * into r from public.list_polls() where id = 'b1000000-0000-4000-8000-0000000000a2';
  if r.total_votes <> 1 or (r.options -> 1 ->> 'votes')::int <> 1 then raise exception 'closed poll counts %', r; end if;

  -- Votes go only through the function: no direct writes, closed polls and unknown options are refused.
  begin insert into public.poll_votes(poll_id, user_id, option_id) values ('b1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-00000000000a', 'a'); raise exception 'inserted directly';
  exception when insufficient_privilege then null; end;
  begin perform public.vote_poll('b1000000-0000-4000-8000-0000000000a2', 'a'); raise exception 'voted after close';
  exception when raise_exception then if sqlerrm <> 'この投票は締め切りました' then raise; end if; end;
  begin perform public.vote_poll('b1000000-0000-4000-8000-0000000000a1', 'z'); raise exception 'unknown option accepted';
  exception when raise_exception then if sqlerrm <> '選択肢を選んでください' then raise; end if; end;

  -- Voting reveals the counts; a second vote (even for another option) is refused and changes nothing.
  perform public.vote_poll('b1000000-0000-4000-8000-0000000000a1', 'a');
  begin perform public.vote_poll('b1000000-0000-4000-8000-0000000000a1', 'b'); raise exception 'voted twice';
  exception when raise_exception then if sqlerrm <> 'この投票には投票済みです' then raise; end if; end;
  begin update public.poll_votes set option_id = 'b'; raise exception 'changed vote';
  exception when insufficient_privilege then null; end;
  begin delete from public.poll_votes; raise exception 'withdrew vote';
  exception when insufficient_privilege then null; end;
  select * into r from public.list_polls() where id = 'b1000000-0000-4000-8000-0000000000a1';
  if r.my_option <> 'a' or r.total_votes <> 1 or (r.options -> 0 ->> 'votes')::int <> 1 or (r.options -> 1 ->> 'votes')::int <> 0 then raise exception 'after voting %', r; end if;
end $$;

-- Another user sees only their own vote rows, and the counts stay hidden until they vote.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-00000000000b', true);
do $$ declare r record; begin
  if exists (select 1 from public.poll_votes where user_id <> 'b1000000-0000-4000-8000-00000000000b') then raise exception 'read others votes'; end if;
  select * into r from public.list_polls() where id = 'b1000000-0000-4000-8000-0000000000a1';
  if r.total_votes is not null then raise exception 'counts shown to a non-voter'; end if;
end $$;

-- Votes go with the account.
reset role;
delete from auth.users where id = 'b1000000-0000-4000-8000-00000000000a';
do $$ begin
  if exists (select 1 from public.poll_votes where user_id = 'b1000000-0000-4000-8000-00000000000a') then raise exception 'vote outlived the account'; end if;
end $$;
rollback;
