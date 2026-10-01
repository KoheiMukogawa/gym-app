-- Bodyweight exercises (chin-ups, dips): sets store the added load, which may be
-- negative for assisted sets. The bodyweight itself is kept private per user and
-- per date, so the total load can be computed for any past set.
begin;

alter table public.exercises add column if not exists is_bodyweight boolean not null default false;
update public.exercises set is_bodyweight = true
 where is_preset and name_normalized in ('チンニング', 'ディップス');

alter table public.workout_sets drop constraint if exists workout_sets_weight_kg_check;
alter table public.workout_sets add constraint workout_sets_weight_kg_check check (weight_kg >= -500);

create table if not exists public.bodyweight_logs (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recorded_on date not null,
  bodyweight_kg numeric(4,1) not null check (bodyweight_kg between 20 and 300),
  primary key (user_id, recorded_on)
);
alter table public.bodyweight_logs enable row level security;
drop policy if exists "bodyweight_logs_own" on public.bodyweight_logs;
create policy "bodyweight_logs_own" on public.bodyweight_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.bodyweight_logs to authenticated;

commit;
