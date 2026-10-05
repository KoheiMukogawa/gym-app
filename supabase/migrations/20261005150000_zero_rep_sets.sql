-- A failed attempt (e.g. a missed BIG3 lift) is recorded with zero reps. Rankings, DOTS and BIG3
-- already count only sets of 1-10 reps, so zero-rep sets never enter an estimated 1RM.
begin;
alter table public.workout_sets drop constraint workout_sets_reps_check;
alter table public.workout_sets add constraint workout_sets_reps_check check (reps >= 0);
commit;
