-- BIG3の目標に種目別の目標（任意）を足す。合計の目標はこれまでどおり必須。
-- 本人の行だけを読み書きするRLS（strength_goals_*_own）はそのまま使う。
alter table public.strength_goals
  add column target_squat_kg numeric(5,1) check (target_squat_kg > 0),
  add column target_bench_kg numeric(5,1) check (target_bench_kg > 0),
  add column target_deadlift_kg numeric(5,1) check (target_deadlift_kg > 0);
