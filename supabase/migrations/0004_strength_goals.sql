create table public.strength_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 40),
  target_date date not null,
  target_total_kg numeric(5,1) not null check (target_total_kg > 0),
  created_at timestamptz not null default now()
);

create index strength_goals_user_date_idx
  on public.strength_goals (user_id, target_date asc);

alter table public.strength_goals enable row level security;

create policy "strength_goals_select_own" on public.strength_goals
  for select to authenticated using (user_id = auth.uid());

create policy "strength_goals_insert_own" on public.strength_goals
  for insert to authenticated with check (user_id = auth.uid());

create policy "strength_goals_update_own" on public.strength_goals
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "strength_goals_delete_own" on public.strength_goals
  for delete to authenticated using (user_id = auth.uid());
