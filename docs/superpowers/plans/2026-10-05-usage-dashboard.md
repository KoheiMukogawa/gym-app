# 利用状況ダッシュボード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者がヘッダーのメニューから、記録した人数などの集計値と週ごとの推移を見られるようにする。

**Architecture:** 管理者だけが実行できるsecurity definerの関数 `admin_usage_stats()` が、集計値だけをjsonbで返す。画面 `/admin/usage` は、数字のカード・棒グラフ（Recharts）・表でそれを表示する。管理者の判定は既存の `useFeedbackInbox` を使う。エラーの文言はご意見機能と共通の `adminMessage` にまとめる。

**Tech Stack:** PostgreSQL（Supabase）、React 19、Recharts 3、Vitest + Testing Library、Playwright（モックE2E）、PGlite（SQLテスト）

**Spec:** `docs/superpowers/specs/2026-10-05-usage-dashboard-design.md`

## Global Constraints

- UI文言は日本語、コード識別子とコミットメッセージは英語
- 主要操作のタップ領域は最低56px（`min-h-14`）
- 通信エラーは画面内に残し、「再試行」を出す
- 「使った」はワークアウトを記録したこと。週は月曜始まり・日本時間。過去12週（今週を含む）
- `auth.users.email` が `@example.com` で終わるアカウントは数えない
- 集計値だけを返し、個人の行は返さない
- 各タスクで本番DBへの書き込みや `git push` はしない
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

- 日本時間の日曜23時台と月曜0時台の記録が、別の週に入る（Task 1）
- 未来の日付で入力された記録は、直近7日・30日の人数に入らない（Task 1）
- テスト用アカウントの記録と登録は、どの数字にも入らない（Task 1）
- 390px幅で、カード・グラフ・5列の表が横にはみ出さない（Task 3のE2E）
- 管理者でない人がURLを直接開いても、集計は返らず「権限がありません」と出る（Task 1・Task 2）

---

### Task 1: DB関数 `admin_usage_stats()`

**Files:**
- Create: `supabase/migrations/20261005130000_usage_stats.sql`
- Create: `supabase/tests/usage_stats.sql`
- Modify: `supabase/tests/sql-runtime/run-sql.mjs`（`suites` の末尾に `'usage_stats.sql'`）

**Interfaces:**
- Produces: `public.admin_usage_stats() returns jsonb` — `{ total_users, active_7d, active_30d, weeks: [{ week_start: 'YYYY-MM-DD', active_users, workouts, sets, signups }] }`（weeksは12件、古い順）

- [ ] **Step 1: SQLテストを書く**

`supabase/tests/usage_stats.sql`:

```sql
-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('e0000000-0000-4000-8000-00000000000a', 'admin@glog.test', '{"display_name":"運営"}'),
 ('e0000000-0000-4000-8000-00000000000b', 'b@glog.test', '{"display_name":"B"}'),
 ('e0000000-0000-4000-8000-00000000000c', 'c@glog.test', '{"display_name":"C"}'),
 ('e0000000-0000-4000-8000-00000000000d', 'd@glog.test', '{"display_name":"D"}'),
 ('e0000000-0000-4000-8000-00000000000e', 'e@glog.test', '{"display_name":"E"}'),
 ('e0000000-0000-4000-8000-0000000000ff', 'e2e@example.com', '{"display_name":"テスト"}');
insert into public.admins(user_id) values ('e0000000-0000-4000-8000-00000000000a');

-- wa: the Monday three weeks before this week (Japan time), far from the 7-day window.
create temp table k as select date_trunc('week', now() at time zone 'Asia/Tokyo')::date - 21 as wa;
-- Everyone signed up long ago, except B and the test account, who signed up in week wa.
update public.profiles set created_at = now() - interval '200 days'
 where id in ('e0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000d', 'e0000000-0000-4000-8000-00000000000e');
update public.profiles set created_at = ((select wa from k) + time '10:00') at time zone 'Asia/Tokyo'
 where id in ('e0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-0000000000ff');

insert into public.workouts(id, user_id, performed_at) values
 -- B: Monday 00:30 and Tuesday of week wa.
 ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000b', ((select wa from k) + time '00:30') at time zone 'Asia/Tokyo'),
 ('e1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000b', ((select wa from k) + 1 + time '12:00') at time zone 'Asia/Tokyo'),
 -- A: Sunday 23:30 just before week wa, so the week before.
 ('e1000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000a', ((select wa from k) - 1 + time '23:30') at time zone 'Asia/Tokyo'),
 -- The test account in week wa: never counted.
 ('e1000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-0000000000ff', ((select wa from k) + 2 + time '12:00') at time zone 'Asia/Tokyo'),
 -- C yesterday, D in the future, E long ago.
 ('e1000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-00000000000c', now() - interval '1 day'),
 ('e1000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000d', now() + interval '2 days'),
 ('e1000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000000e', now() - interval '100 days');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select w.id, e.id, n, 60, 5
 from (values ('e1000000-0000-4000-8000-000000000001'::uuid, 2), ('e1000000-0000-4000-8000-000000000002'::uuid, 1),
              ('e1000000-0000-4000-8000-000000000003'::uuid, 1), ('e1000000-0000-4000-8000-000000000004'::uuid, 5),
              ('e1000000-0000-4000-8000-000000000005'::uuid, 1)) as w(id, sets)
 cross join generate_series(1, w.sets) n
 cross join (select id from public.exercises where is_preset and name_normalized = 'ベンチプレス') e;
grant select on k to authenticated;

-- anon cannot run it; authenticated can.
do $$ begin
  if has_function_privilege('anon', 'public.admin_usage_stats()', 'execute') then raise exception 'anon can run usage stats'; end if;
  if not has_function_privilege('authenticated', 'public.admin_usage_stats()', 'execute') then raise exception 'authenticated cannot run usage stats'; end if;
end $$;

set local role authenticated;

-- Signed out and non-admins are refused.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.admin_usage_stats(); raise exception 'ran signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000b', true);
do $$ begin
  begin perform public.admin_usage_stats(); raise exception 'non-admin ran usage stats';
  exception when raise_exception then if sqlerrm <> '権限がありません' then raise; end if; end;
end $$;

-- The admin gets the totals and the weekly series.
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000a', true);
do $$ declare s jsonb := public.admin_usage_stats(); wa date := (select wa from k); w jsonb; this_week date := date_trunc('week', now() at time zone 'Asia/Tokyo')::date;
begin
  if (s->>'total_users')::int <> 5 then raise exception 'total_users %', s->'total_users'; end if;
  if (s->>'active_7d')::int <> 1 then raise exception 'active_7d %', s->'active_7d'; end if;
  if (s->>'active_30d')::int <> 3 then raise exception 'active_30d %', s->'active_30d'; end if;
  if jsonb_array_length(s->'weeks') <> 12 then raise exception 'weeks %', jsonb_array_length(s->'weeks'); end if;
  if s->'weeks'->0->>'week_start' <> to_char(this_week - 77, 'YYYY-MM-DD')
    or s->'weeks'->11->>'week_start' <> to_char(this_week, 'YYYY-MM-DD') then raise exception 'week range %', s->'weeks'; end if;
  select x into w from jsonb_array_elements(s->'weeks') x where x->>'week_start' = to_char(wa, 'YYYY-MM-DD');
  if w <> jsonb_build_object('week_start', to_char(wa, 'YYYY-MM-DD'), 'active_users', 1, 'workouts', 2, 'sets', 3, 'signups', 1) then
    raise exception 'week wa %', w; end if;
  select x into w from jsonb_array_elements(s->'weeks') x where x->>'week_start' = to_char(wa - 7, 'YYYY-MM-DD');
  if w <> jsonb_build_object('week_start', to_char(wa - 7, 'YYYY-MM-DD'), 'active_users', 1, 'workouts', 1, 'sets', 1, 'signups', 0) then
    raise exception 'week before wa %', w; end if;
  select x into w from jsonb_array_elements(s->'weeks') x where x->>'week_start' = to_char(wa - 14, 'YYYY-MM-DD');
  if w <> jsonb_build_object('week_start', to_char(wa - 14, 'YYYY-MM-DD'), 'active_users', 0, 'workouts', 0, 'sets', 0, 'signups', 0) then
    raise exception 'empty week %', w; end if;
end $$;
rollback;
```

`run-sql.mjs` の `suites` の末尾に `'usage_stats.sql'` を加える。

- [ ] **Step 2: 失敗を確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: `FAIL usage_stats.sql: function public.admin_usage_stats() does not exist`

- [ ] **Step 3: migrationを書く**

`supabase/migrations/20261005130000_usage_stats.sql`:

```sql
-- Usage dashboard for operators: aggregate counts only, never anyone's rows.
-- A day of use is a day with a recorded workout; weeks start on Monday in Japan time.
-- Test accounts (@example.com) are left out.
begin;
create or replace function public.admin_usage_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
 u uuid := auth.uid();
 this_week date := date_trunc('week', now() at time zone 'Asia/Tokyo')::date;
 result jsonb;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 with members as (
  select p.id, date_trunc('week', p.created_at at time zone 'Asia/Tokyo')::date as signup_week
  from public.profiles p left join auth.users au on au.id = p.id
  where au.email is null or au.email not like '%@example.com'
 ), member_workouts as (
  select w.id, w.user_id, w.performed_at, date_trunc('week', w.performed_at at time zone 'Asia/Tokyo')::date as week
  from public.workouts w join members m on m.id = w.user_id
 ), weeks as (
  select (this_week - 7 * n) as week from generate_series(0, 11) n
 )
 select jsonb_build_object(
  'total_users', (select count(*) from members),
  'active_7d', (select count(distinct mw.user_id) from member_workouts mw where mw.performed_at > now() - interval '7 days' and mw.performed_at <= now()),
  'active_30d', (select count(distinct mw.user_id) from member_workouts mw where mw.performed_at > now() - interval '30 days' and mw.performed_at <= now()),
  'weeks', (select jsonb_agg(jsonb_build_object(
     'week_start', to_char(k.week, 'YYYY-MM-DD'),
     'active_users', (select count(distinct mw.user_id) from member_workouts mw where mw.week = k.week),
     'workouts', (select count(*) from member_workouts mw where mw.week = k.week),
     'sets', (select count(*) from public.workout_sets s join member_workouts mw on mw.id = s.workout_id where mw.week = k.week),
     'signups', (select count(*) from members m where m.signup_week = k.week)
    ) order by k.week) from weeks k)
 ) into result;
 return result;
end $$;
revoke all on function public.admin_usage_stats() from public, anon;
grant execute on function public.admin_usage_stats() to authenticated;
commit;
```

- [ ] **Step 4: 通ることを確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: 全スイートPASS（`PASS usage_stats.sql` を含む）

- [ ] **Step 5: コミットする**

```bash
git add supabase/migrations/20261005130000_usage_stats.sql supabase/tests/usage_stats.sql supabase/tests/sql-runtime/run-sql.mjs
git commit -m "Add the admin usage stats function

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 共通のエラー文言、通信、利用状況の画面

**Files:**
- Modify: `src/lib/errors.ts`（`adminMessage` を追加）、`src/lib/errors.test.ts`
- Modify: `src/features/feedback/queries.ts`（`feedbackMessage` を `adminMessage` の別名にする）
- Create: `src/features/admin/usageQueries.ts`、`src/features/admin/usageQueries.test.ts`
- Create: `src/features/admin/UsagePage.tsx`、`src/features/admin/UsagePage.test.tsx`
- Modify: `src/App.tsx`（lazy importと `/admin/usage` のルート）

**Interfaces:**
- Consumes: Task 1の `admin_usage_stats`
- Produces: `adminMessage(error: unknown): string`、`type UsageWeek`、`type UsageStats`、`fetchUsageStats(): Promise<UsageStats>`、`formatWeek(date: string): string`、`UsagePage`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/errors.test.ts` の末尾に加える（先頭のimportに `adminMessage` を追加する）:

```ts
describe('adminMessage', () => {
  it('shows the database reasons as they are', () => {
    for (const message of ['ログインが必要です', '権限がありません', '送信の上限に達しました。時間をおいてお試しください'])
      expect(adminMessage({ message })).toBe(message)
  })
  it('explains a missing function or table', () => {
    for (const code of ['PGRST202', 'PGRST205'])
      expect(adminMessage({ code, message: 'Could not find' })).toBe('この機能の準備中です。時間をおいてお試しください。')
  })
  it('falls back to the shared messages', () => {
    expect(adminMessage(new Error('boom'))).toBe('エラーが発生しました。もう一度お試しください。')
  })
})
```

`src/features/admin/usageQueries.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { fetchUsageStats, formatWeek } from './usageQueries'

beforeEach(() => vi.clearAllMocks())

it('reads the usage stats', async () => {
  const stats = { total_users: 5, active_7d: 1, active_30d: 3, weeks: [] }
  rpc.mockResolvedValue({ data: stats, error: null })
  await expect(fetchUsageStats()).resolves.toEqual(stats)
  expect(rpc).toHaveBeenCalledWith('admin_usage_stats')
})
it('throws the RPC error', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: '権限がありません' } })
  await expect(fetchUsageStats()).rejects.toEqual({ message: '権限がありません' })
})
it('formats a week start as month/day', () => {
  expect(formatWeek('2026-10-05')).toBe('10/5')
  expect(formatWeek('2026-01-12')).toBe('1/12')
})
```

`src/features/admin/UsagePage.test.tsx`:

```tsx
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { fetchUsageStats } = vi.hoisted(() => ({ fetchUsageStats: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./usageQueries', async (original) => ({ ...await original<typeof import('./usageQueries')>(), fetchUsageStats }))
import { UsagePage } from './UsagePage'

const week = (week_start: string, active_users = 0, workouts = 0, sets = 0, signups = 0) => ({ week_start, active_users, workouts, sets, signups })
const stats = {
  total_users: 6, active_7d: 2, active_30d: 4,
  weeks: [week('2026-09-28', 3, 5, 40, 1), week('2026-10-05', 2, 2, 18, 0)],
}
const tile = (label: string) => screen.getByText(label).closest('div')!
beforeEach(() => { vi.clearAllMocks(); fetchUsageStats.mockResolvedValue(stats) })

it('shows the totals, this week and the weekly table newest first', async () => {
  render(<UsagePage />)
  expect(await screen.findByRole('heading', { name: '利用状況' })).toBeInTheDocument()
  expect(screen.getByText(/ワークアウトを記録した日を、使った日として数えています/)).toBeInTheDocument()
  expect(within(tile('登録者数')).getByText('6')).toBeInTheDocument()
  expect(within(tile('直近7日に記録した人')).getByText('2')).toBeInTheDocument()
  expect(within(tile('直近30日に記録した人')).getByText('4')).toBeInTheDocument()
  expect(within(tile('今週のセット数')).getByText('18')).toBeInTheDocument()
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  expect(rows.map((row) => row.textContent)).toEqual(['10/5〜22180', '9/28〜35401'])
})

it('shows the error with a retry', async () => {
  fetchUsageStats.mockRejectedValueOnce({ message: '権限がありません' })
  render(<UsagePage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('権限がありません')
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(await screen.findByRole('heading', { name: '利用状況' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/lib/errors.test.ts src/features/admin`
Expected: FAIL（`adminMessage` が未定義、`./usageQueries`・`./UsagePage` が見つからない）

- [ ] **Step 3: 実装する**

`src/lib/errors.ts` の末尾に加える:

```ts
// Reasons raised by the admin and feedback database functions are written for the user.
const ADMIN_REASONS = ['ログインが必要です', '権限がありません', '送信の上限に達しました。時間をおいてお試しください']

export function adminMessage(error: unknown): string {
  const e = (error ?? {}) as ErrorLike
  if (e.code === 'PGRST202' || e.code === 'PGRST205') return 'この機能の準備中です。時間をおいてお試しください。'
  return ADMIN_REASONS.includes(e.message ?? '') ? e.message! : toMessage(error)
}
```

`src/features/feedback/queries.ts`: `toMessage` のimportを `adminMessage` に替え、`KNOWN` と `feedbackMessage` 関数を次の1行に置き換える:

```ts
export const feedbackMessage = adminMessage
```

`src/features/admin/usageQueries.ts`:

```ts
import { supabase } from '../../lib/supabase'

export type UsageWeek = { week_start: string; active_users: number; workouts: number; sets: number; signups: number }
export type UsageStats = { total_users: number; active_7d: number; active_30d: number; weeks: UsageWeek[] }

/** 管理者向けの集計値。週は古い順の12件。 */
export async function fetchUsageStats(): Promise<UsageStats> {
  const { data, error } = await supabase.rpc('admin_usage_stats')
  if (error) throw error
  return data as UsageStats
}

/** 週の開始日（YYYY-MM-DD）を「10/5」の形にする。 */
export function formatWeek(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}
```

`src/features/admin/UsagePage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { adminMessage } from '../../lib/errors'
import { fetchUsageStats, formatWeek, type UsageStats, type UsageWeek } from './usageQueries'

// The accent is already validated on the dark surface (see BodyTrendChart).
const BAR = '#E8412F'
const tick = { fill: '#8A8A93', fontSize: 11 }

export function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null); setStats(null)
    fetchUsageStats().then(setStats).catch((e: unknown) => setError(adminMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{error}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!stats) return <Spinner />
  const tiles: [string, number, string][] = [
    ['登録者数', stats.total_users, '人'],
    ['直近7日に記録した人', stats.active_7d, '人'],
    ['直近30日に記録した人', stats.active_30d, '人'],
    ['今週のセット数', stats.weeks.at(-1)?.sets ?? 0, 'セット'],
  ]
  return <section className="space-y-6 p-4">
    <div>
      <h1 className="text-2xl font-semibold">利用状況</h1>
      <p className="mt-1 text-xs leading-relaxed text-muted">ワークアウトを記録した日を、使った日として数えています。テスト用アカウントは含みません。</p>
    </div>
    <dl className="grid grid-cols-2 gap-3">{tiles.map(([label, value, unit]) => <div key={label} className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}<span className="ml-1 text-sm font-normal text-muted">{unit}</span></dd>
    </div>)}</dl>
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">記録した人数（週ごと）</figcaption>
      <ActiveUsersChart weeks={stats.weeks} />
    </figure>
    <table className="w-full text-sm">
      <caption className="sr-only">週ごとの利用状況</caption>
      <thead><tr className="text-xs text-muted">
        <th scope="col" className="py-2 text-left font-normal">週</th>
        <th scope="col" className="text-right font-normal">記録した人</th>
        <th scope="col" className="text-right font-normal">ワークアウト</th>
        <th scope="col" className="text-right font-normal">セット</th>
        <th scope="col" className="text-right font-normal">新規登録</th>
      </tr></thead>
      <tbody>{[...stats.weeks].reverse().map((w) => <tr key={w.week_start} className="border-t border-border">
        <th scope="row" className="py-2 text-left font-normal">{formatWeek(w.week_start)}〜</th>
        <td className="text-right tabular-nums">{w.active_users}</td>
        <td className="text-right tabular-nums">{w.workouts}</td>
        <td className="text-right tabular-nums">{w.sets}</td>
        <td className="text-right tabular-nums">{w.signups}</td>
      </tr>)}</tbody>
    </table>
  </section>
}

function ActiveUsersChart({ weeks }: { weeks: UsageWeek[] }) {
  const data = weeks.map((w) => ({ label: formatWeek(w.week_start), active_users: w.active_users }))
  return <div className="h-48 w-full" aria-hidden="true">
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval={1} />
        <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.06)' }}
          contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F', borderRadius: 12 }}
          labelStyle={{ color: '#F5F5F5' }} itemStyle={{ color: '#F5F5F5' }}
          labelFormatter={(label) => `${label}〜の週`} formatter={(value) => [`${value}人`, '記録した人']} />
        <Bar dataKey="active_users" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}
```

（グラフは同じ値を表でも読めるので、読み上げからは外す。）

`src/App.tsx`: `AdminFeedbackPage` のlazy importの次に `const UsagePage = lazy(() => import('./features/admin/UsagePage').then((m) => ({ default: m.UsagePage })))`、`/admin/feedback` のルートの次に `<Route path="/admin/usage" element={<UsagePage />} />` を加える。

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/lib/errors.test.ts src/features/admin src/features/feedback`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add src/lib/errors.ts src/lib/errors.test.ts src/features/feedback/queries.ts src/features/admin src/App.tsx
git commit -m "Add the admin usage page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: メニューの入口、プライバシーポリシー、モックE2E

**Files:**
- Modify: `src/components/AppShell.tsx`、`src/components/AppShell.test.tsx`
- Modify: `src/features/legal/privacy-policy.md`、`src/features/legal/LegalPages.test.tsx`
- Create: `tests/e2e/usage.spec.ts`
- Modify: `playwright.mock.config.ts`（`testMatch` に `'usage.spec.ts'`）

**Interfaces:**
- Consumes: Task 2のルート `/admin/usage`、既存の `useFeedbackInbox`（管理者以外は `null`）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/AppShell.test.tsx` の `describe('feedback in the profile menu', ...)` に加える:

```tsx
  it('hides the usage page from users', async () => {
    renderShell(); await flush()
    await userEvent.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    expect(screen.queryByRole('link', { name: '利用状況' })).not.toBeInTheDocument()
  })
  it('shows the usage page link to an admin', async () => {
    fetchIsAdmin.mockResolvedValue(true); fetchUnreadFeedbackCount.mockResolvedValue(0)
    renderShell(); await flush()
    await userEvent.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    expect(screen.getByRole('link', { name: '利用状況' })).toHaveAttribute('href', '/admin/usage')
  })
```

`src/features/legal/LegalPages.test.tsx` のプライバシーポリシーのテストに加える:

```tsx
    expect(screen.getByText('本サービスの改善のため、運営者は、記録した人数やセット数などの集計値を確認します。')).toBeInTheDocument()
```

`tests/e2e/usage.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('an admin opens the usage dashboard from the profile menu', async ({ page }) => {
  const uid = '55555555-5555-4555-8555-555555555555', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 20 + 7 * i))
    return { week_start: d.toISOString().slice(0, 10), active_users: i % 4, workouts: i, sets: 10 * i, signups: i % 2 }
  })
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/rest/v1/admins')) return reply([{ user_id: uid }])
    if (path.endsWith('/admin_unread_feedback_count')) return reply(0)
    if (path.endsWith('/admin_usage_stats')) return reply({ total_users: 6, active_7d: 2, active_30d: 4, weeks })
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '運営' })
    return reply([])
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'プロフィールメニュー' }).click()
  await page.getByRole('link', { name: '利用状況' }).click()
  await expect(page.getByRole('heading', { name: '利用状況' })).toBeVisible()
  await expect(page.getByText('直近30日に記録した人')).toBeVisible()
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(9)
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(13)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
```

（`active_users` が0の週は棒が描かれないので、12週のうち `i % 4 === 0` の3週を除く9本になる。）

`playwright.mock.config.ts` の `testMatch` の末尾に `'usage.spec.ts'` を加える。

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/components/AppShell.test.tsx src/features/legal`
Expected: 「利用状況」のリンクがない、ポリシーの文がないことで FAIL

- [ ] **Step 3: 実装する**

`src/components/AppShell.tsx`: 「届いた意見」のリンクを、管理者向けの2つのリンクに置き換える:

```tsx
{unreadFeedback!==null&&<><Link to="/admin/feedback" className="flex min-h-14 items-center gap-2 px-3 text-sm">届いた意見{hasUnread&&<span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">新着 {unreadFeedback}</span>}</Link><Link to="/admin/usage" className="flex min-h-14 items-center px-3 text-sm">利用状況</Link></>}
```

`src/features/legal/privacy-policy.md`: 「2. 利用目的」の番号付きリストの後（「5. 問い合わせへの対応…」の次）に空行を挟んで加える:

```markdown
本サービスの改善のため、運営者は、記録した人数やセット数などの集計値を確認します。
```

改定日は `2026年10月5日` のまま（同じ日の改定）。

- [ ] **Step 4: 全体の確認**

Run（順に）: `npm run lint`（エラー0）、`npm run build`、`npm test`、`node supabase/tests/sql-runtime/run-sql.mjs`、`npm run test:e2e:mock -- --workers=1`
Expected: すべてPASS

- [ ] **Step 5: コミットする**

```bash
git add src/components/AppShell.tsx src/components/AppShell.test.tsx src/features/legal tests/e2e/usage.spec.ts playwright.mock.config.ts
git commit -m "Link the usage dashboard from the admin menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 公開（本人の許可済み）

1. migration `usage_stats` を本番に適用する（`begin`/`commit` を除いて `apply_migration`）
2. 読み取りで、関数と実行権限（anon不可）を確認し、本人として1回実行して値が妥当か確かめる
3. `git fetch` してからpushし、CIと公開中のバンドルを確認する
4. CLAUDE.mdを更新する（公開済みの機能、適用済みのmigration、advisorsの件数12件）
