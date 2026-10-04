-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('d0000000-0000-4000-8000-00000000000a', 'leave@example.com', '{"display_name":"退会者"}'),
 ('d0000000-0000-4000-8000-00000000000b', 'stay@example.com', '{"display_name":"残る人"}');

-- A: one workout with a preset set and a custom-exercise set, a custom exercise, a body log,
-- a BIG3 mapping, a goal, a routine, an exercise order, a Health token,
-- an owned community with B as a member, and a membership in B's community.
insert into public.exercises(id, name, name_normalized, muscle_group, is_preset, created_by) values
 ('d1000000-0000-4000-8000-00000000000a', '自作A', '自作a', 'chest', false, 'd0000000-0000-4000-8000-00000000000a'),
 ('d1000000-0000-4000-8000-00000000000b', '自作B', '自作b', 'chest', false, 'd0000000-0000-4000-8000-00000000000b');
insert into public.workouts(id, user_id) values
 ('d2000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a'),
 ('d2000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select 'd2000000-0000-4000-8000-00000000000a', id, 1, 60, 5 from public.exercises where is_preset and name_normalized = 'ベンチプレス';
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps) values
 ('d2000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000a', 2, 20, 10),
 ('d2000000-0000-4000-8000-00000000000b', 'd1000000-0000-4000-8000-00000000000b', 1, 30, 10);
insert into public.bodyweight_logs(user_id, recorded_on, bodyweight_kg) values
 ('d0000000-0000-4000-8000-00000000000a', '2026-10-01', 70),
 ('d0000000-0000-4000-8000-00000000000b', '2026-10-01', 80);
insert into public.big3_exercise_mappings(user_id, lift_type, exercise_id) values
 ('d0000000-0000-4000-8000-00000000000a', 'bench', 'd1000000-0000-4000-8000-00000000000a');
insert into public.strength_goals(user_id, label, target_date, target_total_kg) values
 ('d0000000-0000-4000-8000-00000000000a', 'BIG3', '2026-12-31', 400);
insert into public.training_routines(id, user_id, name, exercise_ids) values
 ('d3000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', '胸の日', array['d1000000-0000-4000-8000-00000000000a']::uuid[]);
insert into public.exercise_preferences(user_id, exercise_order) values
 ('d0000000-0000-4000-8000-00000000000a', array['d1000000-0000-4000-8000-00000000000a']::uuid[]);
insert into health_sync_private.tokens(user_id, token_hash, issued_at) values
 ('d0000000-0000-4000-8000-00000000000a', repeat('a', 64), now());
insert into public.communities(id, owner_id, name) values
 ('d4000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', 'Aの会'),
 ('d4000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b', 'Bの会');
insert into public.community_members(community_id, user_id) values
 ('d4000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a'),
 ('d4000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000b'),
 ('d4000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b'),
 ('d4000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000a');

-- anon can run neither function; authenticated can.
do $$ begin
  if has_function_privilege('anon', 'public.delete_my_account(text)', 'execute')
    or has_function_privilege('anon', 'public.account_deletion_summary()', 'execute') then
    raise exception 'anon can run account deletion functions'; end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account(text)', 'execute')
    or not has_function_privilege('authenticated', 'public.account_deletion_summary()', 'execute') then
    raise exception 'authenticated cannot run account deletion functions'; end if;
end $$;

set local role authenticated;

-- Signed out: both functions refuse.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.account_deletion_summary(); raise exception 'summary ran signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
  begin perform public.delete_my_account('退会する'); raise exception 'deletion ran signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000a', true);

-- The summary counts A's data and names A's community with the other members.
do $$ declare s jsonb := public.account_deletion_summary(); begin
  if s <> jsonb_build_object('workout_days', 1, 'set_count', 2, 'body_log_count', 1, 'custom_exercise_count', 1,
    'health_sync_connected', true, 'owned_communities', jsonb_build_array(jsonb_build_object('name', 'Aの会', 'other_member_count', 1))) then
    raise exception 'unexpected summary: %', s; end if;
end $$;

-- A wrong confirmation, including surrounding spaces, deletes nothing.
do $$ declare c text; begin
  foreach c in array array['', '退会', ' 退会する', '退会する ', null] loop
    begin perform public.delete_my_account(c); raise exception 'deleted with confirmation %', coalesce(c, 'null');
    exception when raise_exception then if sqlerrm <> '確認の文字が一致しません' then raise; end if; end;
  end loop;
end $$;

-- Another user's set that points at A's custom exercise stops the whole deletion.
reset role;
insert into auth.users(id, email, raw_user_meta_data) values
 ('d0000000-0000-4000-8000-00000000000c', 'other@example.com', '{"display_name":"参照する人"}');
insert into public.workouts(id, user_id) values
 ('d2000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000c');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps) values
 ('d2000000-0000-4000-8000-00000000000c', 'd1000000-0000-4000-8000-00000000000a', 1, 10, 10);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000a', true);
do $$ begin
  begin perform public.delete_my_account('退会する'); raise exception 'deleted while another user referenced a custom exercise';
  exception when raise_exception then if sqlerrm <> 'ほかの利用者の記録が使っている種目があるため退会できません' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from auth.users where id = 'd0000000-0000-4000-8000-00000000000a')
    or (select count(*) from public.workouts where user_id = 'd0000000-0000-4000-8000-00000000000a') <> 1
    or (select count(*) from public.big3_exercise_mappings where user_id = 'd0000000-0000-4000-8000-00000000000a') <> 1 then
    raise exception 'a refused deletion removed data'; end if;
end $$;
delete from auth.users where id = 'd0000000-0000-4000-8000-00000000000c';

-- The real deletion.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000a', true);
select public.delete_my_account('退会する');
reset role;

-- Nothing that points at A's profile is left, in any table.
do $$ declare r record; n bigint; begin
  for r in select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using 'd0000000-0000-4000-8000-00000000000a'::uuid;
    if n <> 0 then raise exception '% still has % rows for the deleted user', r.tbl, n; end if;
  end loop;
  if exists (select 1 from auth.users where id = 'd0000000-0000-4000-8000-00000000000a') then raise exception 'auth user remains'; end if;
  if exists (select 1 from public.profiles where id = 'd0000000-0000-4000-8000-00000000000a') then raise exception 'profile remains'; end if;
  if exists (select 1 from public.exercises where id = 'd1000000-0000-4000-8000-00000000000a') then raise exception 'custom exercise remains'; end if;
  if exists (select 1 from public.communities where id = 'd4000000-0000-4000-8000-00000000000a') then raise exception 'owned community remains'; end if;
  if exists (select 1 from public.community_members where community_id = 'd4000000-0000-4000-8000-00000000000a') then raise exception 'owned community members remain'; end if;
end $$;

-- B keeps everything, including B's community without A in it.
do $$ begin
  if not exists (select 1 from public.profiles where id = 'd0000000-0000-4000-8000-00000000000b')
    or (select count(*) from public.workout_sets where workout_id = 'd2000000-0000-4000-8000-00000000000b') <> 1
    or not exists (select 1 from public.exercises where id = 'd1000000-0000-4000-8000-00000000000b')
    or not exists (select 1 from public.bodyweight_logs where user_id = 'd0000000-0000-4000-8000-00000000000b')
    or not exists (select 1 from public.communities where id = 'd4000000-0000-4000-8000-00000000000b')
    or (select array_agg(user_id) from public.community_members where community_id = 'd4000000-0000-4000-8000-00000000000b')
      <> array['d0000000-0000-4000-8000-00000000000b']::uuid[] then
    raise exception 'the other user lost data'; end if;
end $$;
rollback;
