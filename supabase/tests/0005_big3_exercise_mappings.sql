-- Run after migrations 0001-0005 on a disposable local/test database as postgres.
-- Fixtures and all mutations are rolled back; do not run against production.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000501', 'mapping-test-1@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000502', 'mapping-test-2@example.test', '{}');

insert into public.exercises (id, name, name_normalized, is_preset, created_by, muscle_group) values
  ('00000000-0000-0000-0000-000000000511', 'Mapping test A', 'mapping-test-a', false, '00000000-0000-0000-0000-000000000501', 'back'),
  ('00000000-0000-0000-0000-000000000512', 'Mapping test B', 'mapping-test-b', false, '00000000-0000-0000-0000-000000000502', 'back');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

insert into public.big3_exercise_mappings values
  ('00000000-0000-0000-0000-000000000501', 'deadlift', '00000000-0000-0000-0000-000000000511');

do $$
begin
  if (select count(*) from public.big3_exercise_mappings) <> 1 then
    raise exception 'Owner must be able to read their mapping';
  end if;
  begin
    insert into public.big3_exercise_mappings values
      ('00000000-0000-0000-0000-000000000501', 'deadlift', '00000000-0000-0000-0000-000000000512');
    raise exception 'Duplicate user/lift must fail';
  exception when unique_violation then null;
  end;
  begin
    insert into public.big3_exercise_mappings values
      ('00000000-0000-0000-0000-000000000501', 'other', '00000000-0000-0000-0000-000000000511');
    raise exception 'Invalid lift type must fail';
  exception when check_violation then null;
  end;
  begin
    insert into public.big3_exercise_mappings values
      ('00000000-0000-0000-0000-000000000501', 'bench', '00000000-0000-0000-0000-000000000599');
    raise exception 'Missing exercise must fail';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.big3_exercise_mappings values
      ('00000000-0000-0000-0000-000000000502', 'bench', '00000000-0000-0000-0000-000000000511');
    raise exception 'Insert for another user must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.big3_exercise_mappings set user_id = '00000000-0000-0000-0000-000000000502';
    raise exception 'Changing ownership must fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Upsert may select any existing exercise, including one created by another user.
insert into public.big3_exercise_mappings values
  ('00000000-0000-0000-0000-000000000501', 'deadlift', '00000000-0000-0000-0000-000000000512')
on conflict (user_id, lift_type) do update set exercise_id = excluded.exercise_id;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
do $$
begin
  if exists (select 1 from public.big3_exercise_mappings) then
    raise exception 'Another user must not read mappings';
  end if;
  update public.big3_exercise_mappings set exercise_id = '00000000-0000-0000-0000-000000000511'
    where user_id = '00000000-0000-0000-0000-000000000501';
  if found then raise exception 'Another user must not update mappings'; end if;
  delete from public.big3_exercise_mappings where user_id = '00000000-0000-0000-0000-000000000501';
  if found then raise exception 'Another user must not delete mappings'; end if;
end;
$$;

-- The same lift type is valid for a different user.
insert into public.big3_exercise_mappings values
  ('00000000-0000-0000-0000-000000000502', 'deadlift', '00000000-0000-0000-0000-000000000511');

reset role;
do $$
begin
  if (select count(*) from public.big3_exercise_mappings
      where user_id in ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000502')) <> 2 then
    raise exception 'Upsert must preserve one mapping per user/lift';
  end if;
  if (select exercise_id from public.big3_exercise_mappings where user_id = '00000000-0000-0000-0000-000000000501')
      <> '00000000-0000-0000-0000-000000000512'::uuid then
    raise exception 'Upsert must replace the exercise';
  end if;
  begin
    delete from public.exercises where id = '00000000-0000-0000-0000-000000000512';
    raise exception 'Deleting a mapped exercise must fail';
  exception when restrict_violation or foreign_key_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
delete from public.big3_exercise_mappings
  where user_id = '00000000-0000-0000-0000-000000000501' and lift_type = 'deadlift';
do $$
begin
  if exists (select 1 from public.big3_exercise_mappings) then
    raise exception 'Owner must be able to reset their mapping';
  end if;
end;
$$;

rollback;
