-- Custom exercise names are personal: only preset exercises are shared.
-- (Workouts, sets and profiles were already restricted to their owner in 0008.)
alter policy "exercises_select" on public.exercises
  using (is_preset or created_by = auth.uid());

-- Trigger functions must not be callable through the API (/rest/v1/rpc/...).
-- Triggers still run: Postgres checks EXECUTE only when the trigger is created.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
