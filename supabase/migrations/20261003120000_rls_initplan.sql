-- Evaluate auth.uid() once per query instead of once per row (Supabase lint 0003_auth_rls_initplan).
-- Each policy keeps its command, roles and meaning; only the call is wrapped in a scalar subquery.

alter policy big3_exercise_mappings_select_own on public.big3_exercise_mappings
  using (user_id = (select auth.uid()));
alter policy big3_exercise_mappings_insert_own on public.big3_exercise_mappings
  with check (user_id = (select auth.uid()));
alter policy big3_exercise_mappings_update_own on public.big3_exercise_mappings
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy big3_exercise_mappings_delete_own on public.big3_exercise_mappings
  using (user_id = (select auth.uid()));
alter policy strength_goals_select_own on public.strength_goals
  using (user_id = (select auth.uid()));
alter policy strength_goals_insert_own on public.strength_goals
  with check (user_id = (select auth.uid()));
alter policy strength_goals_update_own on public.strength_goals
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy strength_goals_delete_own on public.strength_goals
  using (user_id = (select auth.uid()));
alter policy exercise_preferences_select_own on public.exercise_preferences
  using (user_id = (select auth.uid()));
alter policy exercise_preferences_insert_own on public.exercise_preferences
  with check (user_id = (select auth.uid()));
alter policy exercise_preferences_update_own on public.exercise_preferences
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy exercise_preferences_delete_own on public.exercise_preferences
  using (user_id = (select auth.uid()));
alter policy routines_select_own on public.training_routines
  using (user_id = (select auth.uid()));
alter policy routines_insert_own on public.training_routines
  with check (user_id = (select auth.uid()));
alter policy routines_update_own on public.training_routines
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy routines_delete_own on public.training_routines
  using (user_id = (select auth.uid()));
alter policy bodyweight_logs_own on public.bodyweight_logs
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy community_profiles_own on public.community_profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy exercises_select on public.exercises
  using (is_preset or created_by = (select auth.uid()));
alter policy exercises_insert_own on public.exercises
  with check (created_by = (select auth.uid()) and is_preset = false);
alter policy exercises_update_own on public.exercises
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()) and is_preset = false);
alter policy exercises_delete_own on public.exercises
  using (created_by = (select auth.uid()));
alter policy profiles_select on public.profiles
  using (id = (select auth.uid()));
alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
alter policy workouts_select on public.workouts
  using (user_id = (select auth.uid()));
alter policy workouts_insert_own on public.workouts
  with check (user_id = (select auth.uid()));
alter policy workouts_update_own on public.workouts
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy workouts_delete_own on public.workouts
  using (user_id = (select auth.uid()));
alter policy sets_select on public.workout_sets
  using (exists (select 1 from public.workouts w where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())));
alter policy sets_insert_own on public.workout_sets
  with check (exists (select 1 from public.workouts w where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())));
alter policy sets_update_own on public.workout_sets
  using (exists (select 1 from public.workouts w where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workouts w where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())));
alter policy sets_delete_own on public.workout_sets
  using (exists (select 1 from public.workouts w where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())));

-- Covers the owner foreign key (Supabase lint 0001_unindexed_foreign_keys).
create index if not exists communities_owner_id_idx on public.communities (owner_id);

-- A direct table update could opt in to DOTS without a formula; save_dots_settings already refuses that.
alter table public.community_profiles
  add constraint community_profiles_dots_formula_required check (not dots_opt_in or dots_formula is not null);

notify pgrst, 'reload schema';
