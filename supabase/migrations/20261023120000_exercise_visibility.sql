-- Keep the existing starter list for every user. These arrays only record changes.
alter table public.exercise_preferences
  add column added_exercise_ids uuid[] not null default '{}' check (cardinality(added_exercise_ids) <= 1000 and array_position(added_exercise_ids, null) is null),
  add column hidden_exercise_ids uuid[] not null default '{}' check (cardinality(hidden_exercise_ids) <= 1000 and array_position(hidden_exercise_ids, null) is null);
