-- Abs on the picker: the abdominal machine joins the existing ab roller preset.
insert into public.exercises (name, name_normalized, muscle_group, is_preset) values
 ('アブドミナル', 'アブドミナル', 'core', true)
on conflict (name_normalized) where is_preset do nothing;
