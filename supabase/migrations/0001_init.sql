create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create type public.muscle_group as enum ('chest', 'back', 'legs', 'shoulders', 'arms', 'core');

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_normalized text not null,
  muscle_group public.muscle_group not null,
  is_preset boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((is_preset and created_by is null) or (not is_preset and created_by is not null))
);

create unique index exercises_name_normalized_key on public.exercises (name_normalized);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  performed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index workouts_user_performed_idx on public.workouts (user_id, performed_at desc);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  set_index integer not null check (set_index >= 1),
  weight_kg numeric(5,1) not null check (weight_kg >= 0),
  reps integer not null check (reps >= 1),
  created_at timestamptz not null default now()
);

create index workout_sets_workout_idx on public.workout_sets (workout_id);
create index workout_sets_exercise_created_idx on public.workout_sets (exercise_id, created_at desc);
