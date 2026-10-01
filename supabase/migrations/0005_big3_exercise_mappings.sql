create table public.big3_exercise_mappings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lift_type text not null check (lift_type in ('squat', 'bench', 'deadlift')),
  -- Prevent deleting a configured exercise from silently restoring a default.
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  primary key (user_id, lift_type)
);

create index big3_exercise_mappings_exercise_idx
  on public.big3_exercise_mappings (exercise_id);

alter table public.big3_exercise_mappings enable row level security;

create policy "big3_exercise_mappings_select_own" on public.big3_exercise_mappings
  for select to authenticated using (user_id = auth.uid());

create policy "big3_exercise_mappings_insert_own" on public.big3_exercise_mappings
  for insert to authenticated with check (user_id = auth.uid());

create policy "big3_exercise_mappings_update_own" on public.big3_exercise_mappings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "big3_exercise_mappings_delete_own" on public.big3_exercise_mappings
  for delete to authenticated using (user_id = auth.uid());
