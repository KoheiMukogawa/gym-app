-- Body fat percentage alongside weight. Optional: a weight-only entry stays valid.
alter table public.bodyweight_logs add column if not exists body_fat_pct numeric(4,1)
  check (body_fat_pct is null or (body_fat_pct >= 1 and body_fat_pct <= 70));
