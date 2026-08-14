alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

-- profiles: 全員が閲覧、本人のみ更新
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- exercises: 全員が閲覧。自作種目のみ作成・編集・削除できる
create policy "exercises_select" on public.exercises
  for select to authenticated using (true);
create policy "exercises_insert_own" on public.exercises
  for insert to authenticated with check (created_by = auth.uid() and is_preset = false);
create policy "exercises_update_own" on public.exercises
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid() and is_preset = false);
create policy "exercises_delete_own" on public.exercises
  for delete to authenticated using (created_by = auth.uid());

-- workouts: 全員が閲覧、本人のみ変更
create policy "workouts_select" on public.workouts
  for select to authenticated using (true);
create policy "workouts_insert_own" on public.workouts
  for insert to authenticated with check (user_id = auth.uid());
create policy "workouts_update_own" on public.workouts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workouts_delete_own" on public.workouts
  for delete to authenticated using (user_id = auth.uid());

-- workout_sets: user_id を持たないため、親 workout の所有者で判定する
create policy "sets_select" on public.workout_sets
  for select to authenticated using (true);
create policy "sets_insert_own" on public.workout_sets
  for insert to authenticated with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "sets_update_own" on public.workout_sets
  for update to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "sets_delete_own" on public.workout_sets
  for delete to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

-- 認証ユーザー作成時に profiles を自動生成する
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
