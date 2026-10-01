# 体組成管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 体重と体脂肪率を毎日記録し、7日移動平均つきのグラフで推移を読める「体組成」タブを追加する。

**Architecture:** 既存の `bodyweight_logs` に `body_fat_pct` 列を足し、体重の置き場所を1つに保つ。計算（移動平均・期間フィルタ）は `src/lib/bodyComposition.ts` に純粋関数として置き、画面から切り離して単体テストする。画面は `/body` の新タブ1枚。

**Tech Stack:** React 19 + TypeScript + Vite / Tailwind v4 / Supabase (Postgres + RLS) / Recharts / Vitest + Testing Library / Playwright（モックAPI）

**Spec:** `docs/superpowers/specs/2026-10-02-body-composition-design.md`

## Global Constraints

- UI文言は日本語、コード識別子とコミットメッセージは英語（`CLAUDE.md`）
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する
- 主要操作のタップ領域は最低56px（`min-h-14`）
- 入力欄の文字サイズは16px以上（`src/index.css` の `input, textarea, select` 規則で担保済み。`text-sm` などを入力欄に直接当てない）
- 体脂肪率は `numeric(4,1)`、1〜70%、NULL許容
- 体重は `numeric(4,1)`、20〜300kg
- 1日1件（主キー `(user_id, recorded_on)`）。同じ日は上書き
- 単体テストは `npx vitest run --maxWorkers=1`、E2Eは `npx playwright test --config playwright.mock.config.ts`
- 環境変数が必要: `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY`（テスト実行時はダミー値で可）

---

## File Structure

| ファイル | 責任 |
| --- | --- |
| `supabase/migrations/0015_body_fat.sql` | `body_fat_pct` 列の追加（新規） |
| `src/lib/bodyComposition.ts` | 移動平均・期間フィルタ・入力検証（新規、純粋関数のみ） |
| `src/lib/bodyComposition.test.ts` | 上記の単体テスト（新規） |
| `src/lib/bodyweight.ts` | `BodyweightLog` 型に `body_fat_pct` を追加（修正） |
| `src/features/profile/bodyweightQueries.ts` | 取得・保存・削除。体脂肪率に対応（修正） |
| `src/features/body/BodyPage.tsx` | 体組成タブの画面（新規） |
| `src/features/body/BodyPage.test.tsx` | 画面の単体テスト（新規） |
| `src/components/AppShell.tsx` | タブに「体組成」を追加（修正） |
| `src/App.tsx` | `/body` ルート（修正） |
| `src/features/profile/ProfilePage.tsx` | 体重入力を体組成タブへの導線に置き換え（修正） |
| `src/lib/exportMarkdown.ts` | 体脂肪率をエクスポートに追加（修正） |
| `tests/e2e/simple-flow.spec.ts` | 体組成のE2E（修正） |

---

### Task 1: データベースに体脂肪率の列を足す

**Files:**
- Create: `supabase/migrations/0015_body_fat.sql`

**Interfaces:**
- Consumes: なし
- Produces: `public.bodyweight_logs.body_fat_pct numeric(4,1)` — NULL許容、1〜70

- [ ] **Step 1: マイグレーションファイルを書く**

```sql
-- Body fat percentage alongside weight. Optional: a weight-only entry stays valid.
alter table public.bodyweight_logs add column if not exists body_fat_pct numeric(4,1)
  check (body_fat_pct is null or (body_fat_pct >= 1 and body_fat_pct <= 70));
```

- [ ] **Step 2: 本番に適用する**

Supabase MCP の `apply_migration` を使う（name: `body_fat`, project_id: `lombbjpiftuqkacasmzg`）。
追加のみなので既存の動作には影響しない。

- [ ] **Step 3: 適用されたことを確認する**

`execute_sql` で次を実行し、1行返ることを確認:

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='bodyweight_logs' and column_name='body_fat_pct';
```

Expected: `body_fat_pct | numeric | YES`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_body_fat.sql
git commit -m "Add an optional body fat column to the bodyweight log"
```

---

### Task 2: 移動平均と期間フィルタを計算する

**Files:**
- Create: `src/lib/bodyComposition.ts`
- Create: `src/lib/bodyComposition.test.ts`
- Modify: `src/lib/bodyweight.ts`（`BodyweightLog` に `body_fat_pct` を追加）

**Interfaces:**
- Consumes: `BodyweightLog` from `src/lib/bodyweight.ts`
- Produces:
  - `type BodyMetric = 'bodyweight_kg' | 'body_fat_pct'`
  - `type TrendPoint = { date: string; value: number; average: number }`
  - `movingAverage(logs: BodyweightLog[], metric: BodyMetric, windowDays?: number): TrendPoint[]`
  - `withinPeriod(logs: BodyweightLog[], months: number, today?: string): BodyweightLog[]`
  - `parseBodyFat(value: string): number | null`

- [ ] **Step 1: 型に体脂肪率を足す**

`src/lib/bodyweight.ts` の先頭の型をこう変える:

```ts
export type BodyweightLog = { recorded_on: string; bodyweight_kg: number; body_fat_pct?: number | null }
```

他の関数は変更しない（`bodyweightOn` と `latestBodyweight` は体重だけを見る）。

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/bodyComposition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { movingAverage, parseBodyFat, withinPeriod } from './bodyComposition'

const log = (recorded_on: string, bodyweight_kg: number, body_fat_pct?: number) => ({ recorded_on, bodyweight_kg, body_fat_pct })

describe('movingAverage', () => {
  it('averages the record itself and the six days before it', () => {
    const logs = [log('2026-09-01', 70), log('2026-09-02', 71), log('2026-09-03', 72)]
    expect(movingAverage(logs, 'bodyweight_kg')).toEqual([
      { date: '2026-09-01', value: 70, average: 70 },
      { date: '2026-09-02', value: 71, average: 70.5 },
      { date: '2026-09-03', value: 72, average: 71 },
    ])
  })

  it('drops days outside the window instead of carrying them forward', () => {
    // 9/01 は 9/10 の7日窓（9/04〜9/10）の外なので平均に入らない
    const logs = [log('2026-09-01', 60), log('2026-09-09', 70), log('2026-09-10', 72)]
    expect(movingAverage(logs, 'bodyweight_kg').at(-1)).toEqual({ date: '2026-09-10', value: 72, average: 71 })
  })

  it('skips records that have no value for the metric', () => {
    const logs = [log('2026-09-01', 70, 20), log('2026-09-02', 71), log('2026-09-03', 72, 18)]
    expect(movingAverage(logs, 'body_fat_pct')).toEqual([
      { date: '2026-09-01', value: 20, average: 20 },
      { date: '2026-09-03', value: 18, average: 19 },
    ])
  })

  it('returns nothing when no record carries the metric', () => {
    expect(movingAverage([log('2026-09-01', 70)], 'body_fat_pct')).toEqual([])
    expect(movingAverage([], 'bodyweight_kg')).toEqual([])
  })

  it('rounds the average to one decimal', () => {
    const logs = [log('2026-09-01', 70), log('2026-09-02', 70), log('2026-09-03', 71)]
    expect(movingAverage(logs, 'bodyweight_kg').at(-1)!.average).toBe(70.3)
  })
})

describe('withinPeriod', () => {
  const logs = [log('2026-07-15', 70), log('2026-09-20', 71), log('2026-10-01', 72)]

  it('keeps records inside the window, counting back from today', () => {
    expect(withinPeriod(logs, 1, '2026-10-02').map((l) => l.recorded_on)).toEqual(['2026-09-20', '2026-10-01'])
    expect(withinPeriod(logs, 12, '2026-10-02')).toHaveLength(3)
  })

  it('includes a record landing exactly on the boundary', () => {
    expect(withinPeriod([log('2026-09-02', 70)], 1, '2026-10-02')).toHaveLength(1)
  })
})

describe('parseBodyFat', () => {
  it('accepts a percentage between 1 and 70', () => {
    expect(parseBodyFat('15.4')).toBe(15.4)
    expect(parseBodyFat('1')).toBe(1)
    expect(parseBodyFat('70')).toBe(70)
  })

  it('rejects anything outside that range or not a number', () => {
    expect(parseBodyFat('0.9')).toBeNull()
    expect(parseBodyFat('71')).toBeNull()
    expect(parseBodyFat('')).toBeNull()
    expect(parseBodyFat('abc')).toBeNull()
  })
})
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vitest run src/lib/bodyComposition.test.ts`
Expected: FAIL（`Failed to resolve import "./bodyComposition"`）

- [ ] **Step 4: 実装を書く**

`src/lib/bodyComposition.ts`:

```ts
import type { BodyweightLog } from './bodyweight'

export type BodyMetric = 'bodyweight_kg' | 'body_fat_pct'
export type TrendPoint = { date: string; value: number; average: number }

const round1 = (value: number) => Math.round(value * 10) / 10

/** 指定日から days 日前の日付（YYYY-MM-DD）。 */
function daysBefore(date: string, days: number): string {
  const base = new Date(date + 'T12:00:00')
  base.setDate(base.getDate() - days)
  return base.toLocaleDateString('sv-SE')
}

/**
 * その指標を持つ記録だけを古い順に並べ、各点に移動平均を添える。
 * 平均はその日を含む windowDays 日間の記録の平均で、記録のない日は数に入れない。
 * 体重は日々ぶれるため、増減の向きはこの平均で読む。
 */
export function movingAverage(logs: BodyweightLog[], metric: BodyMetric, windowDays = 7): TrendPoint[] {
  const points = logs
    .map((logEntry) => ({ date: logEntry.recorded_on, value: logEntry[metric] }))
    .filter((point): point is { date: string; value: number } => typeof point.value === 'number')
    .sort((a, b) => a.date.localeCompare(b.date))

  return points.map((point, index) => {
    const from = daysBefore(point.date, windowDays - 1)
    let sum = 0
    let count = 0
    for (let i = index; i >= 0; i--) {
      if (points[i].date < from) break
      sum += points[i].value
      count += 1
    }
    return { date: point.date, value: point.value, average: round1(sum / count) }
  })
}

/** 今日から months ヶ月前までの記録。境界日はふくむ。 */
export function withinPeriod(logs: BodyweightLog[], months: number, today = new Date().toLocaleDateString('sv-SE')): BodyweightLog[] {
  const base = new Date(today + 'T12:00:00')
  base.setMonth(base.getMonth() - months)
  const from = base.toLocaleDateString('sv-SE')
  return logs.filter((logEntry) => logEntry.recorded_on >= from)
}

/** 体脂肪率の入力値を検証して数値にする。 */
export function parseBodyFat(value: string): number | null {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) && parsed >= 1 && parsed <= 70 ? round1(parsed) : null
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vitest run src/lib/bodyComposition.test.ts`
Expected: PASS（13件）

- [ ] **Step 6: 既存の単体テストが壊れていないことを確認する**

Run: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vitest run --maxWorkers=1 --reporter=dot`
Expected: 全件PASS（型に任意の列を足しただけなので既存は影響を受けない）

- [ ] **Step 7: Commit**

```bash
git add src/lib/bodyComposition.ts src/lib/bodyComposition.test.ts src/lib/bodyweight.ts
git commit -m "Add the moving average and period helpers for body composition"
```

---

### Task 3: 体脂肪率を読み書きできるようにする

**Files:**
- Modify: `src/features/profile/bodyweightQueries.ts`

**Interfaces:**
- Consumes: `BodyweightLog`、`parseBodyFat`
- Produces:
  - `fetchBodyweightLogs(userId: string): Promise<BodyweightLog[]>`（`body_fat_pct` も返す）
  - `saveBodyComposition(userId: string, input: { date?: string; bodyweightKg: number; bodyFatPct: number | null }): Promise<BodyweightLog>`
  - `deleteBodyLog(userId: string, recordedOn: string): Promise<void>`
  - `saveBodyweight` と `parseBodyweight` は従来どおり残す（記録画面が使っている）

- [ ] **Step 1: 取得で体脂肪率も読むようにする**

`fetchBodyweightLogs` の `select` と整形を差し替える:

```ts
export async function fetchBodyweightLogs(userId: string): Promise<BodyweightLog[]> {
  const { data, error } = await supabase.from('bodyweight_logs').select('recorded_on, bodyweight_kg, body_fat_pct')
    .eq('user_id', userId).order('recorded_on', { ascending: true })
  if (error) throw error
  return ((data ?? []) as BodyweightLog[]).map((l) => ({
    recorded_on: l.recorded_on,
    bodyweight_kg: Number(l.bodyweight_kg),
    body_fat_pct: l.body_fat_pct === null || l.body_fat_pct === undefined ? null : Number(l.body_fat_pct),
  }))
}
```

- [ ] **Step 2: 保存と削除を足す**

同ファイルの末尾に足す:

```ts
/** 体重と体脂肪率をまとめて記録する。同じ日に入れ直した場合は上書きする。 */
export async function saveBodyComposition(
  userId: string,
  input: { date?: string; bodyweightKg: number; bodyFatPct: number | null },
): Promise<BodyweightLog> {
  const row = {
    recorded_on: input.date ?? localDate(),
    bodyweight_kg: Math.round(input.bodyweightKg * 10) / 10,
    body_fat_pct: input.bodyFatPct === null ? null : Math.round(input.bodyFatPct * 10) / 10,
  }
  const { error } = await supabase.from('bodyweight_logs').upsert({ user_id: userId, ...row }, { onConflict: 'user_id,recorded_on' })
  if (error) throw error
  return row
}

/** その日の記録を消す。 */
export async function deleteBodyLog(userId: string, recordedOn: string): Promise<void> {
  const { error } = await supabase.from('bodyweight_logs').delete().eq('user_id', userId).eq('recorded_on', recordedOn)
  if (error) throw error
}
```

- [ ] **Step 3: 型チェックを通す**

Run: `npx tsc -b`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/features/profile/bodyweightQueries.ts
git commit -m "Read and write body fat alongside weight"
```

---

### Task 4: 体組成タブの画面を作る

**Files:**
- Create: `src/features/body/BodyPage.tsx`
- Create: `src/features/body/BodyPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `movingAverage`、`withinPeriod`、`parseBodyFat`、`parseBodyweight`、`fetchBodyweightLogs`、`saveBodyComposition`、`deleteBodyLog`、`SwipeRow`、`Button`、`Spinner`、`useSession`
- Produces: `BodyPage`（`/body` で描画されるコンポーネント）

- [ ] **Step 1: 失敗するテストを書く**

`src/features/body/BodyPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BodyPage } from './BodyPage'

const { fetchBodyweightLogs, saveBodyComposition, deleteBodyLog } = vi.hoisted(() => ({
  fetchBodyweightLogs: vi.fn(), saveBodyComposition: vi.fn(), deleteBodyLog: vi.fn(),
}))
vi.mock('../profile/bodyweightQueries', () => ({ fetchBodyweightLogs, saveBodyComposition, deleteBodyLog }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

const today = new Date().toLocaleDateString('sv-SE')
const renderPage = () => render(<MemoryRouter><BodyPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  fetchBodyweightLogs.mockResolvedValue([])
  saveBodyComposition.mockImplementation(async (_u: string, i: { bodyweightKg: number; bodyFatPct: number | null }) =>
    ({ recorded_on: today, bodyweight_kg: i.bodyweightKg, body_fat_pct: i.bodyFatPct }))
})

describe('BodyPage', () => {
  it('records weight and body fat for today', async () => {
    renderPage()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '70.2')
    await userEvent.type(screen.getByLabelText('体脂肪率（%）'), '15.4')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { bodyweightKg: 70.2, bodyFatPct: 15.4 }))
    expect(await within(screen.getByRole('region', { name: '最近の記録' })).findByText(/70\.2/)).toBeInTheDocument()
  })

  it('records weight alone when body fat is left empty', async () => {
    renderPage()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '70')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { bodyweightKg: 70, bodyFatPct: null }))
  })

  it('refuses a weight outside the allowed range', async () => {
    renderPage()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '5')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('体重')
    expect(saveBodyComposition).not.toHaveBeenCalled()
  })

  it('prefills the latest values so an unchanged day is one tap', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: '2026-09-30', bodyweight_kg: 69.8, body_fat_pct: 16 }])
    renderPage()
    expect(await screen.findByLabelText('体重（kg）')).toHaveValue(69.8)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(16)
  })

  it('edits a past day when its row is tapped', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: '2026-09-30', bodyweight_kg: 69.8, body_fat_pct: 16 }])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '2026-09-30 の記録を修正' }))
    expect(screen.getByRole('region', { name: '記録の入力' })).toHaveTextContent('2026-09-30')

    const weight = screen.getByLabelText('体重（kg）')
    await userEvent.clear(weight)
    await userEvent.type(weight, '69.5')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { date: '2026-09-30', bodyweightKg: 69.5, bodyFatPct: 16 }))
    // 保存したら今日の入力に戻る
    expect(screen.getByRole('region', { name: '記録の入力' })).toHaveTextContent('今日')
  })

  it('keeps a retryable error on screen when loading fails', async () => {
    fetchBodyweightLogs.mockRejectedValue(new Error('network'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vitest run src/features/body`
Expected: FAIL（`Failed to resolve import "./BodyPage"`）

- [ ] **Step 3: 画面を実装する**

`src/features/body/BodyPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SwipeRow } from '../../components/SwipeRow'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { movingAverage, parseBodyFat, withinPeriod, type BodyMetric } from '../../lib/bodyComposition'
import type { BodyweightLog } from '../../lib/bodyweight'
import { toMessage } from '../../lib/errors'
import { useSession } from '../auth/SessionProvider'
import { deleteBodyLog, fetchBodyweightLogs, parseBodyweight, saveBodyComposition } from '../profile/bodyweightQueries'

const field = 'min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg tabular-nums'
const METRICS: { key: BodyMetric; label: string; unit: string }[] = [
  { key: 'bodyweight_kg', label: '体重', unit: 'kg' },
  { key: 'body_fat_pct', label: '体脂肪率', unit: '%' },
]
const PERIODS: { months: number; label: string }[] = [
  { months: 1, label: '1ヶ月' }, { months: 3, label: '3ヶ月' }, { months: 12, label: '1年' },
]

export function BodyPage() {
  const { userId } = useSession()
  const [logs, setLogs] = useState<BodyweightLog[]>([])
  const [weight, setWeight] = useState('')
  const [fat, setFat] = useState('')
  const [metric, setMetric] = useState<BodyMetric>('bodyweight_kg')
  const [months, setMonths] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  // null は今日の記録。過去の日をタップするとその日を直す
  const [editing, setEditing] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setError(null)
    fetchBodyweightLogs(userId)
      .then((rows) => {
        if (!active) return
        setLogs(rows)
        // 変わっていない日はそのまま記録できるよう、直近の値を初期表示する
        const latest = rows.at(-1)
        if (latest) {
          setWeight(String(latest.bodyweight_kg))
          setFat(latest.body_fat_pct === null || latest.body_fat_pct === undefined ? '' : String(latest.body_fat_pct))
        }
      })
      .catch((e) => { if (active) setError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])
  useEffect(() => { load() }, [load, attempt])

  async function save() {
    if (!userId || busy) return
    const bodyweightKg = parseBodyweight(weight)
    if (bodyweightKg === null) { setError('体重は20〜300kgで入力してください'); return }
    const bodyFatPct = fat.trim() ? parseBodyFat(fat) : null
    if (fat.trim() && bodyFatPct === null) { setError('体脂肪率は1〜70%で入力してください'); return }
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const row = await saveBodyComposition(userId, editing ? { date: editing, bodyweightKg, bodyFatPct } : { bodyweightKg, bodyFatPct })
      setLogs((old) => [...old.filter((l) => l.recorded_on !== row.recorded_on), row].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on)))
      setEditing(null)
      setSaved(true)
    } catch (e) { setError(toMessage(e)) }
    finally { setBusy(false) }
  }

  async function remove(recordedOn: string) {
    if (!userId || deleting) return
    setDeleting(recordedOn)
    try {
      await deleteBodyLog(userId, recordedOn)
      setLogs((old) => old.filter((l) => l.recorded_on !== recordedOn))
    } catch (e) { setError(toMessage(e)) }
    finally { setDeleting(null) }
  }

  const visible = withinPeriod(logs, months)
  const points = movingAverage(visible, metric)
  const unit = METRICS.find((m) => m.key === metric)!.unit

  return <div className="flex flex-col gap-5 p-4">
    <h1 className="text-2xl font-semibold">体組成</h1>

    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-label="記録の入力">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{editing ?? '今日'}の記録</h2>
        {editing && <button type="button" className="min-h-14 text-sm text-muted" disabled={busy}
          onClick={() => { setEditing(null); setError(null); setSaved(false) }}>今日に戻る</button>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2 text-sm text-muted">体重（kg）
          <input type="number" inputMode="decimal" min="20" max="300" step="0.1" value={weight} disabled={busy}
            onChange={(e) => { setWeight(e.target.value); setSaved(false); setError(null) }} className={field} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">体脂肪率（%）
          <input type="number" inputMode="decimal" min="1" max="70" step="0.1" value={fat} disabled={busy}
            onChange={(e) => { setFat(e.target.value); setSaved(false); setError(null) }} className={field} />
        </label>
      </div>
      <p className="text-xs text-muted">体脂肪率は任意です。同じ日に入れ直すと上書きされます。</p>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button onClick={() => void save()} disabled={busy || !weight.trim()}>{busy ? '保存中…' : '記録する'}</Button>
      {saved && <p role="status" className="text-sm">記録しました</p>}
    </section>

    <section className="flex flex-col gap-3" aria-label="推移">
      <div className="flex border-b border-border">
        {METRICS.map((m) => <button key={m.key} type="button" aria-pressed={metric === m.key}
          className={`min-h-14 flex-1 text-sm ${metric === m.key ? 'border-b-2 border-accent text-fg' : 'text-muted'}`}
          onClick={() => setMetric(m.key)}>{m.label}</button>)}
      </div>
      <div className="flex gap-2">
        {PERIODS.map((p) => <button key={p.months} type="button" aria-pressed={months === p.months}
          className={`min-h-14 flex-1 rounded-xl border text-sm ${months === p.months ? 'border-accent text-fg' : 'border-border text-muted'}`}
          onClick={() => setMonths(p.months)}>{p.label}</button>)}
      </div>
      {loading ? <Spinner /> : points.length === 0
        ? <p className="py-8 text-center text-sm text-muted">この期間の記録はありません</p>
        : <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="date" tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(d: string) => d.slice(5).replace('-', '/')} minTickGap={24} />
                <YAxis tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false} width={44}
                  domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F', borderRadius: 12, color: '#F5F5F5' }}
                  formatter={(v, name) => [`${v} ${unit}`, name === 'average' ? '7日平均' : '記録']} />
                <Line type="monotone" dataKey="value" stroke="#8A8A93" strokeWidth={1} dot={{ r: 2, fill: '#8A8A93' }} />
                <Line type="monotone" dataKey="average" stroke="#E8412F" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>}
      <p className="text-xs text-muted">細い線がその日の記録、太い線が7日移動平均です。体重は日々ぶれるので、増減は太い線で読みます。</p>
    </section>

    <section className="flex flex-col gap-2" aria-label="最近の記録">
      <h2 className="text-sm font-semibold">最近の記録</h2>
      {visible.length === 0 ? <p className="py-4 text-center text-sm text-muted">まだ記録がありません</p>
        : <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
            {[...visible].reverse().map((l) => <SwipeRow key={l.recorded_on} label={`${l.recorded_on} の記録を削除`}
              disabled={deleting !== null} deleting={deleting === l.recorded_on} onDelete={() => remove(l.recorded_on)}>
              <button type="button" aria-label={`${l.recorded_on} の記録を修正`} disabled={busy}
                className="flex min-h-12 flex-1 items-center justify-between gap-2 text-left"
                onClick={() => {
                  setEditing(l.recorded_on)
                  setWeight(String(l.bodyweight_kg))
                  setFat(l.body_fat_pct === null || l.body_fat_pct === undefined ? '' : String(l.body_fat_pct))
                  setError(null)
                  setSaved(false)
                }}>
                <span className="text-sm text-muted">{l.recorded_on}</span>
                <span className="text-lg font-semibold tabular-nums">{l.bodyweight_kg}<span className="text-xs font-normal text-muted"> kg</span>
                  {l.body_fat_pct !== null && l.body_fat_pct !== undefined && <>
                    <span className="ml-2">{l.body_fat_pct}</span><span className="text-xs font-normal text-muted"> %</span></>}</span>
              </button>
            </SwipeRow>)}
          </ul>}
      <p className="text-center text-xs text-muted">タップで修正、左にスワイプで削除</p>
    </section>

    {!loading && error && <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>再試行</Button>}
  </div>
}
```

- [ ] **Step 4: ルートとタブを足す**

`src/App.tsx` の import に加える:

```tsx
import { BodyPage } from './features/body/BodyPage'
```

`/export` のルートの下に加える:

```tsx
                <Route path="/body" element={<BodyPage />} />
```

`src/components/AppShell.tsx` の `TABS` を差し替える:

```tsx
const TABS=[{to:'/',label:'ホーム'},{to:'/history',label:'履歴'},{to:'/big3',label:'BIG3'},{to:'/body',label:'体組成'}]
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vitest run src/features/body`
Expected: PASS（6件）

- [ ] **Step 6: 型チェックと全単体テスト**

Run: `npx tsc -b && VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vitest run --maxWorkers=1 --reporter=dot`
Expected: 全件PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/body src/App.tsx src/components/AppShell.tsx
git commit -m "Add a body composition tab with a seven-day trend"
```

---

### Task 5: 入力場所を1つに寄せ、エクスポートに体脂肪率を足す

**Files:**
- Modify: `src/features/profile/ProfilePage.tsx`
- Modify: `src/lib/exportMarkdown.ts`
- Modify: `src/lib/exportMarkdown.test.ts`

**Interfaces:**
- Consumes: `BodyweightLog`（`body_fat_pct` 付き）
- Produces: なし（既存の表示の変更のみ）

- [ ] **Step 1: プロフィールの体重入力を導線に置き換える**

`src/features/profile/ProfilePage.tsx` の体重のフォーム（`<form className="space-y-3 border-t border-border pt-5" ...>` で始まり `</form>` で終わるブロック）を、まるごと次に差し替える:

```tsx
    <div className="space-y-2 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">体組成</h2>
      <p className="text-xs leading-relaxed text-muted">体重と体脂肪率は体組成タブで記録します。自分だけに表示され、ランキングには公開されません。</p>
      <Link to="/body" className="flex min-h-14 items-center text-sm text-accent">体組成を記録する →</Link>
    </div>
```

同ファイルの import から使わなくなったものを外し、`Link` を足す:

```tsx
import { Link } from 'react-router-dom'
```

`latestBodyweight`、`fetchBodyweightLogs`、`parseBodyweight`、`saveBodyweight` の import と、
体重用の state（`bodyweight`、`bwBusy`、`bwMessage`）および体重を読み込む `useEffect` を削除する。

- [ ] **Step 2: エクスポートに体脂肪率を足す**

`src/lib/exportMarkdown.ts` の日ごとの体重行を差し替える:

```ts
    if (bodyweight !== null) lines.push(`体重: ${kg(bodyweight)} kg`, '')
```

を

```ts
    const fat = bodyweightLogs.find((entry) => entry.recorded_on === localDate(item.performed_at))?.body_fat_pct
    if (bodyweight !== null) {
      lines.push(fat === null || fat === undefined ? `体重: ${kg(bodyweight)} kg` : `体重: ${kg(bodyweight)} kg / 体脂肪率: ${fat.toFixed(1)} %`, '')
    }
```

に変える。

- [ ] **Step 3: エクスポートのテストを足す**

`src/lib/exportMarkdown.test.ts` の最後の `describe` の中に加える:

```ts
  it('includes body fat next to the weight when it was recorded', () => {
    const md = buildWorkoutMarkdown({
      ...base,
      bodyweightLogs: [{ recorded_on: '2026-09-10', bodyweight_kg: 70, body_fat_pct: 15.4 }],
      items: [item('2026-09-10', [set({})])],
    })
    expect(md).toContain('体重: 70.0 kg / 体脂肪率: 15.4 %')
  })
```

- [ ] **Step 4: 型チェックと全単体テスト**

Run: `npx tsc -b && VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx vitest run --maxWorkers=1 --reporter=dot`
Expected: 全件PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/ProfilePage.tsx src/lib/exportMarkdown.ts src/lib/exportMarkdown.test.ts
git commit -m "Point weight entry at the body tab and export body fat"
```

---

### Task 6: E2Eで通して確かめる

**Files:**
- Modify: `tests/e2e/simple-flow.spec.ts`

**Interfaces:**
- Consumes: `mockApi`（同ファイル内のモックAPI）
- Produces: なし

- [ ] **Step 1: モックAPIが体脂肪率を往復できるようにする**

`tests/e2e/simple-flow.spec.ts` の `bodyweight_logs` の分岐を次に差し替える:

```ts
    if (table === 'bodyweight_logs') {
      if (method === 'POST') { bodyweights.splice(0, bodyweights.length, ...bodyweights.filter((b) => b.recorded_on !== body.recorded_on), body); return respond(null, 201) }
      if (method === 'DELETE') { const at = eq('recorded_on'); const i = bodyweights.findIndex((b) => b.recorded_on === at); if (i >= 0) bodyweights.splice(i, 1); return respond(null) }
      return respond(bodyweights)
    }
```

同ファイルの `bodyweights` の型注釈を差し替える:

```ts
  const bodyweights: { recorded_on: string; bodyweight_kg: number; body_fat_pct?: number | null }[] = []
```

- [ ] **Step 2: E2Eを書く**

同ファイルの末尾に加える:

```ts
test('records body composition and shows it on the trend and the list', async ({ page }) => {
  const data = await mockApi(page)
  await page.getByRole('link', { name: '体組成', exact: true }).click()

  await page.getByLabel('体重（kg）').fill('70.2')
  await page.getByLabel('体脂肪率（%）').fill('15.4')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await expect.poll(() => data.bodyweights.at(-1)).toMatchObject({ bodyweight_kg: 70.2, body_fat_pct: 15.4 })
  await expect(page.getByRole('status')).toContainText('記録しました')

  const list = page.getByRole('region', { name: '最近の記録' })
  await expect(list).toContainText('70.2')
  await expect(list).toContainText('15.4')

  // 体脂肪率を空にしても体重だけ記録できる
  await page.getByLabel('体脂肪率（%）').fill('')
  await page.getByLabel('体重（kg）').fill('70.8')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await expect.poll(() => data.bodyweights.at(-1)).toMatchObject({ bodyweight_kg: 70.8, body_fat_pct: null })
  // 1日1件なので上書きされる
  expect(data.bodyweights).toHaveLength(1)

  // 一覧をタップするとその日を直せる
  await page.getByRole('button', { name: /の記録を修正$/ }).click()
  await expect(page.getByRole('region', { name: '記録の入力' })).not.toContainText('今日の記録')
  await page.getByLabel('体重（kg）').fill('71.0')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await expect.poll(() => data.bodyweights.at(-1)).toMatchObject({ bodyweight_kg: 71 })
  await expect(page.getByRole('region', { name: '記録の入力' })).toContainText('今日の記録')

  await page.getByRole('button', { name: '体脂肪率', exact: true }).click()
  await expect(page.getByRole('region', { name: '推移' })).toContainText('この期間の記録はありません')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
```

- [ ] **Step 3: E2Eを実行する**

Run: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx playwright test --config playwright.mock.config.ts --reporter=line -g "body composition"`
Expected: PASS

- [ ] **Step 4: E2E全件を実行する**

Run: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=x npx playwright test --config playwright.mock.config.ts --reporter=line`
タブが4つになったので、`tests/e2e/simple-flow.spec.ts:500` 付近の
`await expect(tabs.getByRole('link')).toHaveCount(3)` を `toHaveCount(4)` に直す（必ず必要）。
直したうえで再実行し、全件PASSを確認する。

- [ ] **Step 5: ビルドを確認する**

Run: `npm run build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/simple-flow.spec.ts
git commit -m "Cover body composition recording end to end"
```

---

### Task 7: 引き継ぎメモを更新する

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 現在地と未完了の作業を書き換える**

`CLAUDE.md` の「未完了の作業」に次を足す:

```markdown
5. 体組成のヘルスケア連携は未実装。設計は `docs/superpowers/specs/2026-10-02-body-composition-design.md` の
   「将来: ショートカット連携」を参照。Edge Function と個人トークンの表を作る回で設計する
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Note the remaining Health sync work in the handover memo"
```
