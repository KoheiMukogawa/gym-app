-- Run after 0006. Keep every historical exercise ID and record.
insert into public.exercises (name, name_normalized, muscle_group, is_preset) values
 ('スミスベンチ', 'スミスベンチ', 'chest', true),
 ('ミリタリープレス', 'ミリタリープレス', 'shoulders', true),
 ('EZカール', 'ezカール', 'arms', true),
 ('ライングエクステンション', 'ライングエクステンション', 'arms', true)
on conflict (name_normalized) where is_preset do nothing;

create table public.training_routines (
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 40),
 exercise_ids uuid[] not null check (cardinality(exercise_ids) between 1 and 30 and array_position(exercise_ids, null) is null),
 created_at timestamptz not null default now()
);
create index training_routines_user_idx on public.training_routines(user_id, created_at);

create table public.exercise_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 exercise_order uuid[] not null default '{}' check (cardinality(exercise_order) <= 1000 and array_position(exercise_order, null) is null)
);
alter table public.training_routines enable row level security;
alter table public.exercise_preferences enable row level security;
create policy routines_select_own on public.training_routines for select to authenticated using (user_id = auth.uid());
create policy routines_insert_own on public.training_routines for insert to authenticated with check (user_id = auth.uid());
create policy routines_update_own on public.training_routines for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routines_delete_own on public.training_routines for delete to authenticated using (user_id = auth.uid());
create policy exercise_preferences_select_own on public.exercise_preferences for select to authenticated using (user_id = auth.uid());
create policy exercise_preferences_insert_own on public.exercise_preferences for insert to authenticated with check (user_id = auth.uid());
create policy exercise_preferences_update_own on public.exercise_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy exercise_preferences_delete_own on public.exercise_preferences for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.training_routines, public.exercise_preferences to authenticated;
