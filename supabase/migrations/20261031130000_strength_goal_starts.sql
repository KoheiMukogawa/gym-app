-- 目標を決めた時点の推定1RM（スタート地点）。ホームのゲージを「スタート→目標」で測るために使う。
-- 以前の目標には無いので任意。本人の行だけを読み書きするRLS（strength_goals_*_own）はそのまま使う。
alter table public.strength_goals
  add column start_total_kg numeric(5,1) check (start_total_kg > 0),
  add column start_squat_kg numeric(5,1) check (start_squat_kg > 0),
  add column start_bench_kg numeric(5,1) check (start_bench_kg > 0),
  add column start_deadlift_kg numeric(5,1) check (start_deadlift_kg > 0);
