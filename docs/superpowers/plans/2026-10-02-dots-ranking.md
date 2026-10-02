# DOTSランキング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録日の体重で補正したDOTSスコアのランキングを、全体とコミュニティの両方に「DOTS」タブとして追加する。参加は体重公開への同意を取った人だけにする。

**Architecture:** 重複している `global_ranking` / `community_ranking` の集計SQLを、クライアントから呼べない内部関数 `big3_member_stats(uuid[])` に切り出し、そこでDOTSも計算する。体重を出すかの判定（`dots_opt_in`）はこの関数の中だけで行う。画面は共通部品 `RankingParts.tsx`（タブとDOTS案内）を両ランキングで使い、プロフィールに参加設定を足す。

**Tech Stack:** React 19 + TypeScript + Vite / Tailwind v4 / Supabase (Postgres + RLS) / Vitest + Testing Library / PGlite 0.5.8（SQLテスト）

**Spec:** `docs/superpowers/specs/2026-10-02-dots-ranking-design.md`

## Global Constraints

- UI文言は日本語、コード識別子とコミットメッセージは英語（`CLAUDE.md`）
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する
- 主要操作のタップ領域は最低56px（`min-h-14`）
- 作業開始前に `git status --short` を確認する
- DOTS = 推定1RM × 500 ÷ (a + b·bw + c·bw² + d·bw³ + e·bw⁴)。係数はOpenPowerlifting（`opl-data/crates/coefficients/src/dots.rs`）と照合済み
  - 男性用: a=-307.75076, b=24.0900756, c=-0.1918759221, d=0.0007391293, e=-0.000001093。体重を40〜210kgに丸める
  - 女性用: a=-57.96288, b=13.6175032, c=-0.1126655495, d=0.0005158568, e=-0.0000010706。体重を40〜150kgに丸める
- 体重は記録日（日本時間）との差が14日以内で最も近い日。同じ差なら前の日。差15日は対象外
- DOTSは3種目すべてに値がある場合だけ合計し、小数1位に丸める。表示は単位なし（例 `375.5`）
- 推定1RMの規則は既存どおり（Brzycki式、1〜10回、重量0より大、`performed_at <= now()`）
- `big3_member_stats` と `dots_points` は PUBLIC/anon/authenticated から EXECUTE を剥奪する
- 単体テストは `npx vitest run --maxWorkers=1 <ファイル>`（並列実行は無関係なテストがタイムアウトすることがある）
- SQLテストは `node supabase/tests/sql-runtime/run-sql.mjs`（初回のみ `npm ci --prefix supabase/tests/sql-runtime`）
- 本番DBへのmigration適用・push・デプロイはこの計画に含めない（ユーザーの明示許可が必要）

## Review Focus

- 日付の境界: 日本時間0時台の記録は、UTCでは前日になる。日本時間の日付で体重を探すこと → Task 1 のSQLテスト（01-26 00:30 の記録と 02-09 の体重）で固定
- 同点: DOTSが同じ値の2人は同順位になり、次の人は飛び番になる → Task 2 の `rankMembers` テストで固定
- 読み込み中・通信エラー中に「参加していません」の案内を出さない。エラーを未参加と取り違えない → Task 3 のGlobalRankingテストで固定
- 部分保存: プロフィール保存は成功し、DOTS設定の保存だけ失敗した場合に「保存しました」を出さず、エラーを残す → Task 5 のProfilePageテストで固定
- 参加をやめてから再参加するとき、係数を選び直さなくてよい。参加をやめた直後にスコアが消える → Task 1 のSQLテストで固定

---

## File Structure

| ファイル | 責任 |
| --- | --- |
| `supabase/tests/sql-runtime/package.json` / `package-lock.json` | SQLテスト用のPGlite依存（health-sync-runtimeと同じ版） |
| `supabase/tests/sql-runtime/run-sql.mjs` | 全migrationを一時DBへ適用し、ランキング系SQLテストを実行する |
| `supabase/tests/dots_ranking.sql` | DOTSの計算・権限・設定保存のrollback専用テスト |
| `supabase/migrations/20261002120000_dots_ranking.sql` | 列追加、`dots_points`、`big3_member_stats`、2つのランキングRPCの置き換え、`save_dots_settings` |
| `src/features/community/queries.ts` | 型、`rankMembers` のDOTS対応、`formatMetric`、`saveDotsSettings` |
| `src/features/community/queries.test.ts` | 上記の単体テスト |
| `src/features/community/RankingParts.tsx` | 3つのタブ `MetricTabs` と、自分の状態に応じた `DotsNotice` |
| `src/features/community/GlobalRanking.tsx` / `.test.tsx` | 全体ランキングのDOTSタブ |
| `src/features/community/CommunityPanel.tsx` / `.test.tsx` | コミュニティランキングのDOTSタブ |
| `src/features/profile/ProfilePage.tsx` / `.test.tsx` | DOTS参加と係数の設定 |
| `CLAUDE.md` | 引き継ぎメモの更新 |

---

### Task 1: DOTSを計算するDB関数とSQLテスト

**Files:**
- Create: `supabase/tests/sql-runtime/package.json`, `supabase/tests/sql-runtime/package-lock.json`（`supabase/tests/health-sync-runtime/` からコピー）
- Create: `supabase/tests/sql-runtime/run-sql.mjs`
- Create: `supabase/tests/dots_ranking.sql`
- Create: `supabase/migrations/20261002120000_dots_ranking.sql`

**Interfaces:**
- Produces（RPCの返り値。Task 2以降が使う）: `global_ranking()` と `community_ranking(p_id)` の各要素に `dots: number | null` と `dots_opt_in: boolean` が加わる。既存の `user_id, display_name, icon, bio, lifts, total, growth, points` は変わらない
- Produces: `save_dots_settings(p_opt_in boolean, p_formula text) returns void`。係数が不正、または参加オンで係数なしなら例外メッセージ `DOTSの係数を選んでください`
- Produces: `community_profiles.dots_opt_in boolean not null default false`、`community_profiles.dots_formula text`（`'male'` / `'female'` / null）

- [ ] **Step 1: SQLテストの実行環境を作る**

```bash
mkdir -p supabase/tests/sql-runtime
cp supabase/tests/health-sync-runtime/package.json supabase/tests/health-sync-runtime/package-lock.json supabase/tests/sql-runtime/
npm ci --prefix supabase/tests/sql-runtime
```

`supabase/tests/sql-runtime/run-sql.mjs` を作る。Supabaseの既定権限（public schemaの新しい表と関数は anon/authenticated に付与される）を再現しないと、権限剥奪のテストが意味をなさないので、`alter default privileges` を必ず入れる。`rls_auto_enable` は `0013` が参照するSupabase側の関数のスタブ。

```js
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
// Applies every migration to a throwaway database with Supabase-like roles and default grants,
// then runs the rollback-only ranking suites. Nothing touches a real Supabase project.
const root = resolve(import.meta.dirname, '../../..')
const suites = ['0008_communities.sql', '0009_onboarding_global_ranking.sql', 'dots_ranking.sql']
const db = new PGlite({ extensions: { pgcrypto } })
try {
  await db.exec(`
  create schema extensions; create extension pgcrypto with schema extensions;
  create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
  grant usage on schema public,auth to anon,authenticated,service_role;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
  alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
  create function public.rls_auto_enable() returns void language sql as $$ select $$;
  `)
  const dir = resolve(root, 'supabase/migrations')
  for (const file of readdirSync(dir).sort()) await db.exec(readFileSync(resolve(dir, file), 'utf8'))
  for (const suite of suites) {
    try {
      await db.exec(readFileSync(resolve(root, 'supabase/tests', suite), 'utf8'))
      console.log(`PASS ${suite}`)
    } catch (error) {
      await db.exec('rollback')
      console.error(`FAIL ${suite}: ${error.message}`)
      process.exitCode = 1
    }
  }
} finally {
  await db.close()
}
```

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: `PASS 0008_communities.sql` と `PASS 0009_onboarding_global_ranking.sql`、`FAIL dots_ranking.sql`（ファイルがまだない）。既存の2つがPASSすることで、実行環境が既存のランキングを再現できていることを確認する。

- [ ] **Step 2: 失敗するSQLテストを書く**

`supabase/tests/dots_ranking.sql`:

```sql
begin;
-- d1 male, d2 female, d3 not opted in, d4 opted in but deadlift has no nearby weight, d5 DOTS only (not in global ranking).
insert into auth.users(id,email,raw_user_meta_data) values
 ('d0000000-0000-4000-8000-000000000001','dots1@example.com','{"display_name":"男性"}'),
 ('d0000000-0000-4000-8000-000000000002','dots2@example.com','{"display_name":"女性"}'),
 ('d0000000-0000-4000-8000-000000000003','dots3@example.com','{"display_name":"非参加"}'),
 ('d0000000-0000-4000-8000-000000000004','dots4@example.com','{"display_name":"体重不足"}'),
 ('d0000000-0000-4000-8000-000000000005','dots5@example.com','{"display_name":"全体非公開"}');
update public.community_profiles set global_ranking=true where user_id::text like 'd0000000-%' and user_id<>'d0000000-0000-4000-8000-000000000005';
update public.community_profiles set dots_opt_in=true,dots_formula='male' where user_id in
 ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000005');
update public.community_profiles set dots_opt_in=true,dots_formula='female' where user_id='d0000000-0000-4000-8000-000000000002';
insert into public.bodyweight_logs(user_id,recorded_on,bodyweight_kg) values
 ('d0000000-0000-4000-8000-000000000001','2026-01-08',100.0),
 ('d0000000-0000-4000-8000-000000000001','2026-01-12',90.0),
 ('d0000000-0000-4000-8000-000000000001','2026-03-15',100.0),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10',60.0),
 ('d0000000-0000-4000-8000-000000000002','2026-02-09',60.0),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10',70.0),
 ('d0000000-0000-4000-8000-000000000004','2026-01-10',80.0),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10',80.0);
create temp table dots_sets(user_id uuid,day date,lift text,kg numeric) on commit drop;
insert into dots_sets values
 -- 01-10 is two days from both 01-08 (100kg) and 01-12 (90kg): the earlier weigh-in wins.
 ('d0000000-0000-4000-8000-000000000001','2026-01-10','スクワット',200),
 ('d0000000-0000-4000-8000-000000000001','2026-01-10','ベンチプレス',150),
 ('d0000000-0000-4000-8000-000000000001','2026-01-10','デッドリフト',250),
 -- 14 days before 03-15 counts; 15 days after does not (kg ranking still sees the 300kg squat).
 ('d0000000-0000-4000-8000-000000000001','2026-03-01','デッドリフト',260),
 ('d0000000-0000-4000-8000-000000000001','2026-03-30','スクワット',300),
 -- 15 days before the 03-15 weigh-in does not count either.
 ('d0000000-0000-4000-8000-000000000001','2026-02-28','ベンチプレス',200),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10','ベンチプレス',80),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10','デッドリフト',170),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10','ベンチプレス',100),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10','デッドリフト',200),
 ('d0000000-0000-4000-8000-000000000004','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000004','2026-01-10','ベンチプレス',100),
 ('d0000000-0000-4000-8000-000000000004','2026-06-01','デッドリフト',200),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10','ベンチプレス',100),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10','デッドリフト',200);
insert into public.workouts(id,user_id,performed_at)
 select gen_random_uuid(),user_id,(day+time '12:00') at time zone 'Asia/Tokyo' from (select distinct user_id,day from dots_sets) d;
insert into public.workout_sets(workout_id,exercise_id,set_index,weight_kg,reps)
 select w.id,e.id,row_number() over(partition by w.id),s.kg,1
 from dots_sets s
 join public.workouts w on w.user_id=s.user_id and (w.performed_at at time zone 'Asia/Tokyo')::date=s.day
 join public.exercises e on e.is_preset and e.name_normalized=s.lift;
-- 00:30 in Japan on 01-26 is still 01-25 in UTC. The Japanese date is 14 days from 02-09 and counts.
insert into public.workouts(id,user_id,performed_at) values
 ('d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','2026-01-26 00:30:00+09');
insert into public.workout_sets(workout_id,exercise_id,set_index,weight_kg,reps)
 select 'd1000000-0000-4000-8000-000000000001',id,1,180,1 from public.exercises where is_preset and name_normalized='デッドリフト';
do $$ begin
 if round(public.dots_points(700,100,'male'),4)<>430.8610 then raise exception 'Male DOTS reference mismatch'; end if;
 if round(public.dots_points(400,60,'female'),4)<>443.4182 then raise exception 'Female DOTS reference mismatch'; end if;
 if public.dots_points(100,30,'male')<>public.dots_points(100,40,'male') or public.dots_points(100,250,'male')<>public.dots_points(100,210,'male') then raise exception 'Male bodyweight bounds'; end if;
 if public.dots_points(100,160,'female')<>public.dots_points(100,150,'female') then raise exception 'Female bodyweight bounds'; end if;
 if public.dots_points(100,80,'other') is not null then raise exception 'Unknown formula scored'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare g jsonb; r jsonb; c uuid; code text;
begin
 begin perform public.big3_member_stats(array['d0000000-0000-4000-8000-000000000003'::uuid]); raise exception 'Stats helper callable';
 exception when insufficient_privilege then null; end;
 begin perform public.dots_points(100,80,'male'); raise exception 'DOTS helper callable';
 exception when insufficient_privilege then null; end;
 select jsonb_object_agg(x->>'display_name',x) into g from jsonb_array_elements(public.global_ranking()) x where x->>'user_id' like 'd0000000-%';
 if (g->'男性'->>'dots')::numeric<>375.5 then raise exception 'Nearest/tie/boundary weight wrong: %',g->'男性'; end if;
 if (g->'男性'->>'total')::numeric<>760 then raise exception 'kg total changed: %',g->'男性'; end if;
 if (g->'女性'->>'dots')::numeric<>454.5 then raise exception 'Female DOTS wrong: %',g->'女性'; end if;
 if g->'非参加'->'dots'<>'null'::jsonb or (g->'非参加'->>'dots_opt_in')::boolean then raise exception 'Non-participant scored: %',g->'非参加'; end if;
 if g->'体重不足'->'dots'<>'null'::jsonb or not (g->'体重不足'->>'dots_opt_in')::boolean then raise exception 'Missing weight scored: %',g->'体重不足'; end if;
 if g ? '全体非公開' then raise exception 'DOTS opt-in bypassed global ranking'; end if;
 -- Community: members see each other regardless of the global setting, and only opted-in scores.
 c:=public.community_manage('create','DOTS');
 select public.community_list()->0->>'invite_code' into code;
 perform set_config('test.code',code,true); perform set_config('test.community',c::text,true);
 begin perform public.save_dots_settings(true,null); raise exception 'Opt-in without formula saved';
 exception when raise_exception then if sqlerrm<>'DOTSの係数を選んでください' then raise; end if; end;
 begin perform public.save_dots_settings(true,'other'); raise exception 'Unknown formula saved';
 exception when raise_exception then if sqlerrm<>'DOTSの係数を選んでください' then raise; end if; end;
 perform public.save_dots_settings(false,null);
 if (select dots_formula from public.community_profiles where user_id=auth.uid())<>'male' then raise exception 'Opt-out dropped formula'; end if;
 if (select x->'dots' from jsonb_array_elements(public.global_ranking()) x where x->>'user_id'=auth.uid()::text)<>'null'::jsonb then raise exception 'Opt-out still scored'; end if;
 perform public.save_dots_settings(true,'male');
end $$;
reset role;
do $$ begin
 if (select dots_formula from public.community_profiles where user_id='d0000000-0000-4000-8000-000000000002')<>'female' then raise exception 'Settings touched another user'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000005',true);
set local role authenticated;
do $$ declare r jsonb; begin
 perform public.community_manage('join',current_setting('test.code'));
 select jsonb_object_agg(x->>'display_name',x) into r from jsonb_array_elements(public.community_ranking(current_setting('test.community')::uuid)) x;
 if (r->'男性'->>'dots')::numeric<>375.5 or jsonb_array_length(r->'男性'->'points')=0 then raise exception 'Community DOTS/points wrong: %',r->'男性'; end if;
 if (r->'全体非公開'->>'dots')::numeric is null then raise exception 'Community member DOTS missing: %',r->'全体非公開'; end if;
end $$;
reset role;
rollback;
```

期待値の根拠（JavaScriptで同じ式から計算済み）:
- 男性100kg・合計700 → 430.8610、女性60kg・合計400 → 443.4182
- 男性: スクワット200（01-10、体重は同じ2日差の01-08=100kgを採用）、ベンチ150（同）、デッドリフト260（03-01、14日後の03-15=100kg）→ 610×500÷P(100) = 375.4646 → 375.5。後の日の90kgを使うと388.0、03-30のスクワット300や02-28のベンチ200（差15日）を含めると別の値になる
- kg合計は体重と無関係に 300+200+260 = 760
- 女性: 150+80+180（01-26 00:30 日本時間、02-09の体重と14日差）= 410 → 454.5。UTCの日付で探すと443.4になる

- [ ] **Step 3: テストが失敗することを確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: `FAIL dots_ranking.sql: column "dots_opt_in" of relation "community_profiles" does not exist`（既存2つはPASS）

- [ ] **Step 4: migrationを書く**

`supabase/migrations/20261002120000_dots_ranking.sql`:

```sql
begin;
alter table public.community_profiles
  add column if not exists dots_opt_in boolean not null default false,
  add column if not exists dots_formula text;
alter table public.community_profiles drop constraint if exists community_profiles_dots_formula_check;
alter table public.community_profiles add constraint community_profiles_dots_formula_check
  check ((dots_formula is null or dots_formula in ('male','female')) and (not dots_opt_in or dots_formula is not null));

-- DOTS = kg x 500 / poly4(bodyweight). Coefficients and bodyweight bounds follow OpenPowerlifting.
create or replace function public.dots_points(p_kg numeric, p_bodyweight numeric, p_formula text) returns numeric
language sql immutable set search_path = '' as $$
 select p_kg*500/case p_formula
   when 'male' then -307.75076+24.0900756*b-0.1918759221*b^2+0.0007391293*b^3-0.000001093*b^4
   when 'female' then -57.96288+13.6175032*b-0.1126655495*b^2+0.0005158568*b^3-0.0000010706*b^4 end
 from (select least(greatest(p_bodyweight,40),case p_formula when 'female' then 150 else 210 end) b) x
$$;

create or replace function public.big3_member_stats(p_user_ids uuid[])
returns table(user_id uuid, lifts jsonb, total numeric, growth numeric, dots numeric, dots_opt_in boolean, points jsonb)
language sql stable security definer set search_path = '' as $$
 with members as (
   select distinct u user_id from unnest(p_user_ids) u
 ), resolved as (
   select m.user_id,k.lift,coalesce(b.exercise_id,e.id) exercise_id from members m
   cross join (values ('squat','スクワット'),('bench','ベンチプレス'),('deadlift','デッドリフト')) k(lift,label)
   left join public.big3_exercise_mappings b on b.user_id=m.user_id and b.lift_type=k.lift
   left join public.exercises e on e.is_preset and e.name_normalized=k.label
 ), records as (
   select r.user_id,r.lift,(w.performed_at at time zone 'Asia/Tokyo')::date record_date,
     round(s.weight_kg*36/(37-s.reps),1) value
   from resolved r join public.workouts w on w.user_id=r.user_id
   join public.workout_sets s on s.workout_id=w.id and s.exercise_id=r.exercise_id
   where s.reps between 1 and 10 and s.weight_kg>0 and w.performed_at<=now()
 ), best as (
   select r.user_id,r.lift,max(d.value) value,
     max(d.value) filter(where d.record_date < date_trunc('month',now() at time zone 'Asia/Tokyo')::date) baseline
   from resolved r left join records d on d.user_id=r.user_id and d.lift=r.lift group by r.user_id,r.lift
 ), totals as (
   select b.user_id,jsonb_object_agg(b.lift,b.value) lifts,
     case when count(b.value)=3 then sum(b.value) end total,
     case when count(b.baseline)=3 then sum(b.value)-sum(b.baseline) end growth
   from best b group by b.user_id
 ), weighed as (
   -- Only opted-in members get a bodyweight lookup; nobody else's weight enters the result.
   select d.user_id,d.lift,max(public.dots_points(d.value,w.bodyweight_kg,p.dots_formula)) dots
   from records d
   join public.community_profiles p on p.user_id=d.user_id and p.dots_opt_in
   cross join lateral (
     select l.bodyweight_kg from public.bodyweight_logs l
     where l.user_id=d.user_id and l.recorded_on between d.record_date-14 and d.record_date+14
     order by abs(l.recorded_on-d.record_date),l.recorded_on limit 1
   ) w
   group by d.user_id,d.lift
 ), dots_totals as (
   select w.user_id,case when count(*)=3 then round(sum(w.dots),1) end dots from weighed w group by w.user_id
 ), daily as (
   select d.user_id,d.lift,d.record_date,max(d.value) value from records d group by d.user_id,d.lift,d.record_date
 ), series as (
   select d.user_id,jsonb_agg(jsonb_build_object('lift',d.lift,'date',d.record_date,'value',d.value) order by d.record_date,d.lift) points
   from daily d group by d.user_id
 )
 select t.user_id,t.lifts,t.total,t.growth,x.dots,coalesce(p.dots_opt_in,false),coalesce(s.points,'[]'::jsonb)
 from totals t
 left join dots_totals x on x.user_id=t.user_id
 left join public.community_profiles p on p.user_id=t.user_id
 left join series s on s.user_id=t.user_id
$$;

create or replace function public.global_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio','',
   'lifts',x.lifts,'total',x.total,'growth',x.growth,'dots',x.dots,'dots_opt_in',x.dots_opt_in,'points','[]'::jsonb)
   order by x.total desc nulls last,p.user_id),'[]'::jsonb)
 into result
 from public.big3_member_stats(array(select c.user_id from public.community_profiles c where c.global_ranking)) x
 join public.community_profiles p on p.user_id=x.user_id;
 return result;
end $$;

create or replace function public.community_ranking(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.community_members where community_id=p_id and user_id=auth.uid()) then
   raise exception 'コミュニティに参加していません'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio',p.bio,
   'lifts',x.lifts,'total',x.total,'growth',x.growth,'dots',x.dots,'dots_opt_in',x.dots_opt_in,'points',x.points)
   order by x.total desc nulls last,p.user_id),'[]'::jsonb)
 into result
 from public.big3_member_stats(array(select m.user_id from public.community_members m where m.community_id=p_id)) x
 join public.community_profiles p on p.user_id=x.user_id;
 return result;
end $$;

create or replace function public.save_dots_settings(p_opt_in boolean, p_formula text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 if p_opt_in is null or (p_formula is not null and p_formula not in ('male','female')) or (p_opt_in and p_formula is null) then
   raise exception 'DOTSの係数を選んでください'; end if;
 update public.community_profiles set dots_opt_in=p_opt_in,dots_formula=coalesce(p_formula,dots_formula) where user_id=auth.uid();
 if not found then raise exception '先にプロフィールを保存してください'; end if;
end $$;

revoke all on function public.dots_points(numeric,numeric,text),public.big3_member_stats(uuid[]) from public,anon,authenticated;
revoke all on function public.global_ranking(),public.community_ranking(uuid),public.save_dots_settings(boolean,text) from public,anon;
grant execute on function public.global_ranking(),public.community_ranking(uuid),public.save_dots_settings(boolean,text) to authenticated;
commit;
```

`big3_member_stats` の `members` から `series` までは、`0009` の `global_ranking` と `0008` の `community_ranking` にあった集計をそのまま移したもの（`weighed` と `dots_totals` だけが新規）。kgの結果が変わらないことは、既存の `0008` / `0009` テストがPASSし続けることで確認する。

- [ ] **Step 5: テストが通ることを確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected:
```
PASS 0008_communities.sql
PASS 0009_onboarding_global_ranking.sql
PASS dots_ranking.sql
```

- [ ] **Step 6: テストがバグを検出できることを確認する（一時的な変更、コミットしない）**

migrationを次のように1つずつ壊し、毎回 `FAIL dots_ranking.sql` になることを確認してから元に戻す。

- `l.recorded_on limit 1` → `l.recorded_on desc limit 1`（同じ差で後の日を優先）
- `d.record_date+14` → `d.record_date+15`、`d.record_date-14` → `d.record_date-15`
- `(w.performed_at at time zone 'Asia/Tokyo')::date record_date` → `(w.performed_at at time zone 'UTC')::date record_date`
- `and p.dots_opt_in` を削除
- revoke文から `public.big3_member_stats(uuid[])` を削除

Run: `git diff --stat supabase/migrations` で、元に戻っていること（新規ファイルのみ）を確認する。

- [ ] **Step 7: Commit**

```bash
git add supabase/tests/sql-runtime/package.json supabase/tests/sql-runtime/package-lock.json supabase/tests/sql-runtime/run-sql.mjs supabase/tests/dots_ranking.sql supabase/migrations/20261002120000_dots_ranking.sql
git commit -m "feat: score Big3 rankings with bodyweight-adjusted DOTS"
```

---

### Task 2: ランキングの型・順位付け・表示形式・設定保存

**Files:**
- Modify: `src/features/community/queries.ts`
- Create: `src/features/community/queries.test.ts`

**Interfaces:**
- Consumes: Task 1 のRPC返り値（`dots`, `dots_opt_in`）と `save_dots_settings`
- Produces:
  - `export type DotsFormula = 'male' | 'female'`
  - `export type RankMetric = 'total' | 'growth' | 'dots'`
  - `CommunityProfile` に `dots_opt_in?: boolean; dots_formula?: DotsFormula | null`
  - `Member` に `dots: number | null; dots_opt_in: boolean`
  - `rankMembers(members: Member[], metric: RankMetric): (Member & { rank: number | null })[]`。`'dots'` のときは `dots_opt_in` の人だけを返す
  - `formatMetric(value: number | null, metric: RankMetric): string`
  - `saveDotsSettings(optIn: boolean, formula: DotsFormula | null): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/community/queries.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { communityMessage, formatMetric, rankMembers, saveDotsSettings, type Member } from './queries'

const member = (user_id: string, over: Partial<Member> = {}): Member => ({
  user_id, display_name: user_id, icon: 'initials', bio: '', total: null, growth: null, dots: null, dots_opt_in: false,
  lifts: { squat: null, bench: null, deadlift: null }, points: [], ...over,
})
beforeEach(() => { vi.clearAllMocks() })

it('ranks DOTS among opted-in members only, sharing ranks on ties and leaving missing scores unranked', () => {
  const rows = rankMembers([
    member('a', { dots: 400, dots_opt_in: true, total: 500 }),
    member('b', { dots: 450, dots_opt_in: true, total: 400 }),
    member('c', { dots: 400, dots_opt_in: true, total: 300 }),
    member('d', { dots: null, dots_opt_in: true, total: 600 }),
    member('e', { dots: null, dots_opt_in: false, total: 700 }),
  ], 'dots')
  expect(rows.map((r) => [r.user_id, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', null]])
})

it('keeps every member in the kg rankings', () => {
  const rows = rankMembers([member('a', { total: 500 }), member('e', { total: 700, dots_opt_in: false })], 'total')
  expect(rows.map((r) => [r.user_id, r.rank])).toEqual([['e', 1], ['a', 2]])
})

it('formats DOTS without a unit and kg metrics with one', () => {
  expect(formatMetric(375.5, 'dots')).toBe('375.5')
  expect(formatMetric(400, 'dots')).toBe('400.0')
  expect(formatMetric(760, 'total')).toBe('760 kg')
  expect(formatMetric(12.5, 'growth')).toBe('+12.5 kg')
  expect(formatMetric(null, 'dots')).toBe('—')
})

it('saves DOTS settings through the RPC and surfaces its validation message', async () => {
  rpc.mockResolvedValueOnce({ error: null })
  await saveDotsSettings(true, 'female')
  expect(rpc).toHaveBeenCalledWith('save_dots_settings', { p_opt_in: true, p_formula: 'female' })
  rpc.mockResolvedValueOnce({ error: { message: 'DOTSの係数を選んでください' } })
  const failure = await saveDotsSettings(true, null).catch((e) => e)
  expect(communityMessage(failure)).toBe('DOTSの係数を選んでください')
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/community/queries.test.ts`
Expected: FAIL（`formatMetric` / `saveDotsSettings` がexportされていない）

- [ ] **Step 3: 実装する**

`src/features/community/queries.ts` の型定義（2〜9行目）を置き換える:

```ts
export type Community = { id: string; name: string; owner_id: string; invite_code: string | null }
export type DotsFormula = 'male' | 'female'
export type RankMetric = 'total' | 'growth' | 'dots'
export type CommunityProfile = { global_ranking?: boolean; dots_opt_in?: boolean; dots_formula?: DotsFormula | null; user_id: string; display_name: string; icon: string; bio: string }
export type Member = CommunityProfile & {
  total: number | null; growth: number | null; dots: number | null; dots_opt_in: boolean
  lifts: Record<'squat' | 'bench' | 'deadlift', number | null>
  points: { lift: string; date: string; value: number }[]
}
```

`saveProfile` の後ろに追加:

```ts
export async function saveDotsSettings(optIn: boolean, formula: DotsFormula | null) {
  const { error } = await supabase.rpc('save_dots_settings', { p_opt_in: optIn, p_formula: formula })
  if (error) throw error
}
```

`rankMembers` を置き換え、`formatMetric` を追加:

```ts
export function rankMembers(members: Member[], metric: RankMetric) {
  // DOTS shows only members who agreed to expose a bodyweight-derived score.
  const pool = metric === 'dots' ? members.filter((m) => m.dots_opt_in) : members
  const sorted = [...pool].sort((a, b) => (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity) || a.user_id.localeCompare(b.user_id))
  let rank: number | null = null
  return sorted.map((member, index) => {
    if (member[metric] === null) rank = null
    else if (index === 0 || member[metric] !== sorted[index - 1][metric]) rank = index + 1
    return { ...member, rank }
  })
}

export function formatMetric(value: number | null, metric: RankMetric): string {
  if (value === null) return '—'
  if (metric === 'dots') return value.toFixed(1)
  return `${metric === 'growth' ? '+' : ''}${value} kg`
}
```

`communityMessage` の `known` 配列の末尾に `'DOTSの係数を選んでください'` を追加する。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/community/queries.test.ts`
Expected: 4 passed

Run: `npx tsc -b`
Expected: エラーなし（`GlobalRanking` と `CommunityPanel` は `'total' | 'growth'` を渡しているだけなので、この時点でも型は通る）

- [ ] **Step 5: Commit**

```bash
git add src/features/community/queries.ts src/features/community/queries.test.ts
git commit -m "feat: rank, format, and save DOTS settings on the client"
```

---

### Task 3: 共通部品と全体ランキングのDOTSタブ

**Files:**
- Create: `src/features/community/RankingParts.tsx`
- Modify: `src/features/community/GlobalRanking.tsx`
- Create: `src/features/community/GlobalRanking.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `RankMetric`, `Member`, `rankMembers`, `formatMetric`
- Produces:
  - `MetricTabs({ value, onChange }: { value: RankMetric; onChange: (metric: RankMetric) => void })`。ボタン名は `BIG3合計` / `今月の伸び` / `DOTS`、選択中は `aria-pressed=true`
  - `DotsNotice({ me }: { me: Member | undefined })`。説明文を常に出し、未参加ならプロフィールへのリンク、参加済みでスコアなしなら体組成タブへのリンクを出す

- [ ] **Step 1: 失敗するテストを書く**

`src/features/community/GlobalRanking.test.tsx`:

```tsx
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Member } from './queries'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
import { GlobalRanking } from './GlobalRanking'

const member = (user_id: string, display_name: string, over: Partial<Member> = {}): Member => ({
  user_id, display_name, icon: 'bolt', bio: '', total: 500, growth: null, dots: null, dots_opt_in: false,
  lifts: { squat: null, bench: null, deadlift: null }, points: [], ...over,
})
const show = (members: Member[]) => {
  rpc.mockResolvedValue({ data: members, error: null })
  render(<MemoryRouter><GlobalRanking /></MemoryRouter>)
}
const openDots = async () => {
  await screen.findByRole('list')
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
}
beforeEach(() => { vi.clearAllMocks() })

it('lists only opted-in members on the DOTS tab with unit-less scores', async () => {
  show([
    member('a', '軽量', { total: 400, dots: 375.5, dots_opt_in: true }),
    member('b', '体重なし', { total: 600, dots: null, dots_opt_in: true }),
    member('c', '非参加', { total: 700 }),
  ])
  expect(await screen.findByText('700 kg')).toBeInTheDocument()
  await openDots()
  const rows = within(screen.getByRole('list')).getAllByRole('listitem')
  expect(rows.map((r) => r.textContent)).toEqual(['1軽量375.5', '—体重なし—'])
  expect(screen.queryByText('非参加')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'DOTS' })).toHaveAttribute('aria-pressed', 'true')
})

it('points a non-participant to the profile setting', async () => {
  show([member('me', '自分'), member('a', '軽量', { dots: 375.5, dots_opt_in: true })])
  await openDots()
  expect(screen.getByRole('link', { name: 'DOTSランキングへの参加はプロフィールで設定' })).toHaveAttribute('href', '/profile')
  expect(screen.getByText(/体重の公開に同意した人だけ表示しています/)).toBeInTheDocument()
})

it('points a participant without a score to the body tab', async () => {
  show([member('me', '自分', { dots_opt_in: true })])
  await openDots()
  expect(screen.getByRole('link', { name: '3種目それぞれ、記録日の前後14日以内の体重が必要です' })).toHaveAttribute('href', '/body')
})

it('shows no guidance link once the participant has a score', async () => {
  show([member('me', '自分', { dots: 375.5, dots_opt_in: true })])
  await openDots()
  expect(screen.queryByRole('link', { name: /DOTSランキングへの参加/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /体重が必要です/ })).not.toBeInTheDocument()
})

it('keeps a load failure on screen with retry and never claims the user is not participating', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    .mockResolvedValue({ data: [member('me', '自分', { dots: 375.5, dots_opt_in: true })], error: null })
  render(<MemoryRouter><GlobalRanking /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /DOTSランキングへの参加/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(await screen.findByText('375.5')).toBeInTheDocument()
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/community/GlobalRanking.test.tsx`
Expected: FAIL（`DOTS` ボタンが見つからない）

- [ ] **Step 3: 共通部品を作る**

`src/features/community/RankingParts.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { Member, RankMetric } from './queries'

const LABELS: Record<RankMetric, string> = { total: 'BIG3合計', growth: '今月の伸び', dots: 'DOTS' }

export function MetricTabs({ value, onChange }: { value: RankMetric; onChange: (metric: RankMetric) => void }) {
  return <div className="flex border-b border-border">{(Object.keys(LABELS) as RankMetric[]).map((m) =>
    <button key={m} type="button" aria-pressed={value === m} className={`min-h-14 flex-1 text-sm ${value === m ? 'border-b-2 border-accent text-fg' : 'text-muted'}`} onClick={() => onChange(m)}>{LABELS[m]}</button>)}</div>
}

/** Render only after the ranking loaded: a failed load must not read as "not participating". */
export function DotsNotice({ me }: { me: Member | undefined }) {
  return <div className="space-y-1">
    <p className="text-xs leading-relaxed text-muted">記録日の前後14日以内の体重でDOTSを計算します。体重の公開に同意した人だけ表示しています。</p>
    {!me?.dots_opt_in
      ? <Link to="/profile" className="flex min-h-14 items-center text-sm text-accent">DOTSランキングへの参加はプロフィールで設定</Link>
      : me.dots === null
        ? <Link to="/body" className="flex min-h-14 items-center text-sm text-accent">3種目それぞれ、記録日の前後14日以内の体重が必要です</Link>
        : null}
  </div>
}
```

- [ ] **Step 4: 全体ランキングを差し替える**

`src/features/community/GlobalRanking.tsx` 全体:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { Avatar } from '../profile/Avatar'
import { communityMessage, formatMetric, rankMembers, type Member, type RankMetric } from './queries'
import { DotsNotice, MetricTabs } from './RankingParts'
export function GlobalRanking(){
 const {userId}=useSession();const [members,setMembers]=useState<Member[]>([]),[mode,setMode]=useState<RankMetric>('total'),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0)
 useEffect(()=>{let active=true;setLoading(true);setError(null);Promise.resolve(supabase.rpc('global_ranking')).then(({data,error})=>{if(!active)return;if(error)setError(communityMessage(error));else setMembers(data??[]);setLoading(false)}).catch(e=>{if(active){setError(communityMessage(e));setLoading(false)}});return()=>{active=false}},[attempt])
 const rows=rankMembers(members,mode)
 return <section className="space-y-4" aria-label="全体ランキング"><MetricTabs value={mode} onChange={setMode}/>
 {loading?<Spinner/>:error?<div><p role="alert">{error}</p><Button onClick={()=>setAttempt(n=>n+1)}>再試行</Button></div>:!rows.length?<p className="py-6 text-center text-sm text-muted">参加者はまだいません</p>:<ol className="divide-y divide-border">{rows.map(m=><li key={m.user_id} className={`flex min-h-20 items-center gap-3 px-2 ${m.user_id===userId?'bg-surface':''}`}><span className="w-6 text-sm text-muted">{m.rank??'—'}</span><Avatar icon={m.icon} name={m.display_name}/><span className="min-w-0 flex-1 break-words text-sm">{m.display_name}</span><strong className="shrink-0 tabular-nums">{formatMetric(m[mode],mode)}</strong></li>)}</ol>}
 {/* 説明はランキングの下。まず順位が目に入るようにする。 */}
 <div className="space-y-1 border-t border-border pt-3">
  {mode==='growth'&&<p className="text-xs text-muted">日本時間の月初前に3種目がそろっている人を比較します。</p>}
  {mode==='dots'&&!loading&&!error&&<DotsNotice me={members.find(m=>m.user_id===userId)}/>}
  <p className="text-xs leading-relaxed text-muted">公開を選んだ利用者のランキングです。BIG3は1〜10回の記録を推定1RMに換算。自己申告の記録です。</p>
  <Link to="/profile" className="flex min-h-14 items-center text-sm text-accent">全体ランキングへの参加はプロフィールで設定</Link>
 </div></section>
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/community/GlobalRanking.test.tsx src/features/community/queries.test.ts`
Expected: 9 passed

- [ ] **Step 6: Commit**

```bash
git add src/features/community/RankingParts.tsx src/features/community/GlobalRanking.tsx src/features/community/GlobalRanking.test.tsx
git commit -m "feat: add a DOTS tab to the global ranking"
```

---

### Task 4: コミュニティランキングのDOTSタブ

**Files:**
- Modify: `src/features/community/CommunityPanel.tsx`
- Create: `src/features/community/CommunityPanel.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `RankMetric`, `formatMetric`, `rankMembers`、Task 3 の `MetricTabs`, `DotsNotice`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/community/CommunityPanel.test.tsx`:

```tsx
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Member } from './queries'
const { rpc, listCommunities, profile, ranking } = vi.hoisted(() => ({ rpc: vi.fn(), listCommunities: vi.fn(), profile: vi.fn(), ranking: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('./queries', async (original) => ({ ...await original<typeof import('./queries')>(), listCommunities, profile, ranking }))
import { CommunityPanel } from './CommunityPanel'

const member = (user_id: string, display_name: string, over: Partial<Member> = {}): Member => ({
  user_id, display_name, icon: 'initials', bio: '', total: 500, growth: null, dots: null, dots_opt_in: false,
  lifts: { squat: null, bench: null, deadlift: null }, points: [], ...over,
})
beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: [], error: null })
  listCommunities.mockResolvedValue([{ id: 'c1', name: '仲間', owner_id: 'me', invite_code: null }])
  profile.mockResolvedValue({ user_id: 'me', display_name: '自分', icon: 'initials', bio: '' })
})
const openGroup = async () => {
  await userEvent.click(await screen.findByRole('button', { name: '仲間' }))
}

it('shows opted-in members with unit-less DOTS and guides a member without weights', async () => {
  ranking.mockResolvedValue([
    member('me', '自分', { total: 600, dots_opt_in: true }),
    member('a', '軽量', { total: 400, dots: 375.5, dots_opt_in: true }),
    member('c', '非参加', { total: 700 }),
  ])
  render(<MemoryRouter><CommunityPanel /></MemoryRouter>)
  await openGroup()
  expect(await screen.findByText('700 kg')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(screen.getByText('375.5')).toBeInTheDocument()
  expect(screen.queryByText('非参加')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '3種目それぞれ、記録日の前後14日以内の体重が必要です' })).toHaveAttribute('href', '/body')
})

it('says nobody has joined DOTS yet instead of showing an empty list', async () => {
  ranking.mockResolvedValue([member('me', '自分')])
  render(<MemoryRouter><CommunityPanel /></MemoryRouter>)
  await openGroup()
  await screen.findByText('500 kg')
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(screen.getByText('DOTSの参加者はまだいません')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'DOTSランキングへの参加はプロフィールで設定' })).toBeInTheDocument()
})

it('keeps a ranking failure on screen with retry on the DOTS tab', async () => {
  ranking.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue([member('me', '自分', { dots: 300, dots_opt_in: true })])
  render(<MemoryRouter><CommunityPanel /></MemoryRouter>)
  await openGroup()
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /DOTSランキングへの参加/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(await screen.findByText('300.0')).toBeInTheDocument()
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/community/CommunityPanel.test.tsx`
Expected: FAIL（`DOTS` ボタンが見つからない）

- [ ] **Step 3: 実装する**

`src/features/community/CommunityPanel.tsx`:

import行を変更:

```tsx
import { communityMessage, formatMetric, listCommunities, manage, profile, ranking, rankMembers, saveProfile, type Community, type CommunityProfile, type Member, type RankMetric } from './queries'
import { DotsNotice, MetricTabs } from './RankingParts'
```

state:

```tsx
  const [mode, setMode] = useState<RankMetric>('total')
```

`const detail = ...` の次の行に追加:

```tsx
  const rows = rankMembers(members, mode)
```

タブ行（`<div className="flex border-b border-border">{(['total','growth'] as const).map(...)}</div>`）を置き換える:

```tsx
      <MetricTabs value={mode} onChange={setMode} />
```

一覧（`: <div className="divide-y divide-border">{rankMembers(members, mode).map((m) => ...` の部分）を次に置き換える。行の中身は値の表示以外変えない:

```tsx
      {rankLoading ? <Spinner /> : rankError ? <div><p role="alert">{rankError}</p><Button variant="ghost" onClick={() => setRankAttempt((n) => n + 1)}>再試行</Button></div> : !rows.length ? <p className="py-6 text-center text-sm text-muted">DOTSの参加者はまだいません</p> : <div className="divide-y divide-border">{rows.map((m) => <button key={m.user_id} onClick={() => setPerson(m.user_id)} className={`flex min-h-20 w-full items-center gap-3 px-2 text-left ${m.user_id === userId ? 'bg-surface' : ''}`}>
        <span className="w-6 text-sm text-muted">{m.rank ?? '—'}</span><Avatar icon={m.icon} name={m.display_name}/><span className="min-w-0 flex-1 break-words text-sm">{m.display_name}{m.user_id === userId && <span className="ml-2 text-xs text-muted">自分</span>}</span>
        <span className="shrink-0 text-lg font-semibold tabular-nums">{formatMetric(m[mode], mode)}</span>
      </button>)}</div>}
```

コミュニティには必ず自分がいるので、一覧が空になるのはDOTSタブだけ。そのため空表示の文言はDOTS専用でよい。

説明欄（`<div className="space-y-1 border-t border-border pt-3">` の中身）を置き換える:

```tsx
      <div className="space-y-1 border-t border-border pt-3">
        {mode === 'total' && <p className="text-xs text-muted">各種目の最高推定1RMの合計 · 自己申告の記録</p>}
        {mode === 'growth' && <p className="text-xs text-muted">月初からの自己ベスト合計の増加（日本時間）。月初以前に3種目の記録が必要です。</p>}
        {mode === 'dots' && !rankLoading && !rankError && <DotsNotice me={members.find((m) => m.user_id === userId)} />}
        <p className="text-xs text-muted">— は比較できる記録がまだそろっていない状態です。同じ記録は同順位です。</p>
      </div>
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/community/CommunityPanel.test.tsx`
Expected: 3 passed

Run: `npx tsc -b`
Expected: エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/features/community/CommunityPanel.tsx src/features/community/CommunityPanel.test.tsx
git commit -m "feat: add a DOTS tab to community rankings"
```

---

### Task 5: プロフィールでDOTSへの参加を設定する

**Files:**
- Modify: `src/features/profile/ProfilePage.tsx`
- Create: `src/features/profile/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `saveDotsSettings`, `DotsFormula`, `CommunityProfile.dots_opt_in` / `dots_formula`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/profile/ProfilePage.test.tsx`:

```tsx
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
const { rpc, profile, refreshProfile } = vi.hoisted(() => ({ rpc: vi.fn(), profile: vi.fn(), refreshProfile: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me', profile: { display_name: '自分' }, refreshProfile }) }))
vi.mock('../community/queries', async (original) => ({ ...await original<typeof import('../community/queries')>(), profile }))
import { ProfilePage } from './ProfilePage'

const base = { user_id: 'me', display_name: '自分', icon: 'initials', bio: '', global_ranking: true }
const renderPage = () => render(<MemoryRouter><ProfilePage /></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ error: null })
  refreshProfile.mockResolvedValue(undefined)
})

it('requires a formula before opting in, then saves profile and DOTS settings', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  renderPage()
  await userEvent.click(await screen.findByRole('checkbox', { name: 'DOTSランキングに参加する' }))
  expect(screen.getByRole('button', { name: 'プロフィールを保存' })).toBeDisabled()
  expect(screen.getByText(/体重の公開に同意したことになります/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: '女性用' }))
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
  expect(await screen.findByRole('status')).toHaveTextContent('保存しました')
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(['save_glog_profile', 'save_dots_settings'])
  expect(rpc).toHaveBeenLastCalledWith('save_dots_settings', { p_opt_in: true, p_formula: 'female' })
})

it('loads an existing choice and keeps the formula when opting out', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: true, dots_formula: 'male' })
  renderPage()
  expect(await screen.findByRole('radio', { name: '男性用' })).toBeChecked()
  await userEvent.click(screen.getByRole('checkbox', { name: 'DOTSランキングに参加する' }))
  expect(screen.queryByRole('radio', { name: '男性用' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
  await screen.findByRole('status')
  expect(rpc).toHaveBeenLastCalledWith('save_dots_settings', { p_opt_in: false, p_formula: 'male' })
})

it('keeps the error on screen when only the DOTS settings fail to save', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: true, dots_formula: 'male' })
  rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'DOTSの係数を選んでください' } })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'プロフィールを保存' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('DOTSの係数を選んでください')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/profile/ProfilePage.test.tsx`
Expected: FAIL（`DOTSランキングに参加する` が見つからない）

- [ ] **Step 3: 実装する**

`src/features/profile/ProfilePage.tsx`:

import行を変更:

```tsx
import { communityMessage, profile, saveDotsSettings, type DotsFormula } from '../community/queries'
```

state行（`const [name,setName]=...` の行）の後ろに追加:

```tsx
  const [dotsOptIn,setDotsOptIn]=useState(false),[dotsFormula,setDotsFormula]=useState<DotsFormula|null>(null)
```

読み込み（`setPublicRank(p?.global_ranking??false)` の直後）に追加:

```tsx
setDotsOptIn(p?.dots_opt_in??false);setDotsFormula(p?.dots_formula??null)
```

保存（`if(err)throw err;` の直後、`await refreshProfile()` の前）に追加:

```tsx
await saveDotsSettings(dotsOptIn,dotsFormula);
```

全体ランキングの説明文 `<p>参加すると、名前・アイコン…</p>` の直後、保存ボタンの前に追加:

```tsx
      <label className="flex min-h-14 items-center gap-3 text-sm"><input type="checkbox" checked={dotsOptIn} disabled={busy} onChange={e=>{setDotsOptIn(e.target.checked);setSaved(false)}} className="h-5 w-5 accent-accent"/>DOTSランキングに参加する</label>
      {dotsOptIn&&<fieldset className="space-y-2"><legend className="text-sm text-muted">計算に使う係数</legend><div className="flex gap-2">{([['male','男性用'],['female','女性用']] as const).map(([value,label])=><label key={value} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm"><input type="radio" name="dots-formula" checked={dotsFormula===value} disabled={busy} onChange={()=>{setDotsFormula(value);setSaved(false)}} className="h-5 w-5 accent-accent"/>{label}</label>)}</div></fieldset>}
      <p className="text-xs leading-relaxed text-muted">記録日の前後14日以内の体重でスコアを計算します。スコアとBIG3合計から体重が推定できるため、参加する場合は体重の公開に同意したことになります。</p>
```

保存ボタンの `disabled` を変更:

```tsx
disabled={busy||!name.trim()||(dotsOptIn&&!dotsFormula)}
```

体組成セクションの説明文を変更:

```tsx
<p className="text-xs leading-relaxed text-muted">体重と体脂肪率は体組成タブで記録します。自分だけに表示されます。DOTSランキングに参加した場合だけ、スコアから体重が推定できます。</p>
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run --maxWorkers=1 src/features/profile/ProfilePage.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/ProfilePage.tsx src/features/profile/ProfilePage.test.tsx
git commit -m "feat: let users opt in to DOTS ranking with a formula choice"
```

---

### Task 6: 全体の検証と引き継ぎメモ

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: すべての検証を実行する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: `PASS` が3行

Run: `npx vitest run --maxWorkers=1`
Expected: 全テストPASS

Run: `npm run build`
Expected: 成功

失敗した場合は該当タスクに戻って直す。出力は省略せずに報告に含める。

- [ ] **Step 2: 引き継ぎメモを更新する**

`CLAUDE.md` の「現在地」の末尾に追加:

```markdown
- DOTSランキングをローカル実装: 記録日の前後14日以内の体重で種目ごとにDOTSを出し、全体・コミュニティにDOTSタブ、プロフィールで参加と係数を設定。設計は `docs/superpowers/specs/2026-10-02-dots-ranking-design.md`
- DOTSのmigration `20261002120000_dots_ranking.sql` は本番未適用。既存の `global_ranking` / `community_ranking` を置き換えるため、適用は本人の明示許可後に行う
```

「検証結果」の末尾に追加:

```markdown
- ランキング系SQLは `node supabase/tests/sql-runtime/run-sql.mjs` で、全migrationを適用した一時PGliteに対して実行できる（初回は `npm ci --prefix supabase/tests/sql-runtime`）
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note the local DOTS ranking work in the handover memo"
```
