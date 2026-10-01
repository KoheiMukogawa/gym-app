-- Keep historical IDs; allow the same custom name for different users.
drop index public.exercises_name_normalized_key;
create unique index exercises_preset_name_key
  on public.exercises (name_normalized) where is_preset;
create unique index exercises_personal_name_key
  on public.exercises (created_by, name_normalized) where not is_preset;
