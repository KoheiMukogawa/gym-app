-- Optional memo per set (e.g. form cues, how it felt). Owners can already update their sets.
alter table public.workout_sets add column if not exists note text
  check (note is null or char_length(note) <= 200);
