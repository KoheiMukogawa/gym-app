# BIG3 Starting Bests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People with no BIG3 record see a home card that leads to `/big3/start`, where they enter each lift's best (weight × reps) and a date; the bests are saved as an ordinary workout so totals, rankings, DOTS and charts work at once.

**Architecture:** No database change. Pure input checks and totals live in `src/features/strength/startingBests.ts`; `saveStartingBests` in `src/features/strength/startingBestsQueries.ts` composes the existing history-editor queries (`findWorkoutOnDate`, `createDatedWorkout`, `fetchEditableWorkout`, `saveEditableSet`) and `deleteWorkoutIfEmpty`. A home card (`StartingBestsCard`) and a lazy page (`StartingBestsPage`) are the only UI.

**Tech Stack:** React 19, React Router 7, TypeScript, Tailwind 4, Supabase JS, Vitest + Testing Library, Playwright (mock E2E).

**Spec:** `docs/superpowers/specs/2026-10-07-big3-starting-bests-design.md`

## Global Constraints

- UI copy is Japanese; code identifiers and commit messages are English. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Main tap targets are at least 56px (`min-h-14`).
- A network error is never shown as an empty state: keep the error on screen (`role="alert"`) with a 再試行 button, and keep what the person typed.
- No database migration, no change to ranking SQL, no change to the recording screen (`src/features/workout-log/LogPage.tsx`, `SetList.tsx`).
- Estimated 1RM uses the existing `estimateOneRepMax` (Brzycki, 1–10 reps only).
- Weight: greater than 0, at most 9999.9, one decimal place. Reps: integer 1–10. Date: today or earlier (`workoutDateISO` rules).
- Unit tests: `npx vitest run <paths>`; full: `npx vitest run`. Lint: `npm run lint` (0 errors; the 2 existing warnings in ProfilePage/LogPage are expected). Types: `npx tsc -b`.
- Before starting: `git status --short` must be clean. Do not push; pushing to `master` deploys and needs the owner's explicit permission.

## Review Focus

1. **Two lifts mapped to the same exercise** (a person set BIG3 squat and deadlift both to one custom exercise): both sets must save with distinct `set_index` values (n+1, n+2), never the same index. → test in Task 2.
2. **Untouched rows**: reps defaults to `1`, so a row whose weight is empty is "not entered" and must not show 「重量と回数の両方を入れてください」. Only weight-filled/reps-empty is an error. → test in Task 1.
3. **Full-width digits and decimal commas** typed on a Japanese keyboard (`１００，５`) must be accepted like the public calculators do. → test in Task 1.
4. **The home calendar after saving**: the month cache (`useMonthWorkouts`) must be invalidated so returning home shows the new day without a reload. → test in Task 4.
5. **BIG3 snapshot failed to load on home**: the card must stay hidden (a failure is not "no records"). → test in Task 3.

## File Structure

- Create `src/lib/numbers.ts` — `parseNumber` (moved from `src/features/tools/PublicLayout.tsx`, shared by public tools and the app).
- Create `src/features/strength/startingBests.ts` — pure: `checkBest`, `checkStartingDate`, `startingTotal`, types.
- Create `src/features/strength/startingBestsQueries.ts` — `saveStartingBests`.
- Create `src/features/home/StartingBestsCard.tsx` — the home card.
- Create `src/features/strength/StartingBestsPage.tsx` — the page.
- Modify `src/features/home/HomePage.tsx` — render the card.
- Modify `src/App.tsx` — lazy route `/big3/start`.
- Modify `src/features/tools/PublicLayout.tsx`, `src/features/tools/PublicPages.test.tsx` — import `parseNumber` from its new home.
- Tests next to each file; mock E2E appended to `tests/e2e/simple-flow.spec.ts` (reuses its in-memory `mockApi`).

---

### Task 1: Input checks and totals (pure functions)

**Files:**
- Create: `src/lib/numbers.ts`
- Create: `src/features/strength/startingBests.ts`
- Test: `src/features/strength/startingBests.test.ts`
- Modify: `src/features/tools/PublicLayout.tsx` (remove `parseNumber`, re-import), `src/features/tools/PublicPages.test.tsx` (import path), `src/features/tools/OneRepMaxPage.tsx` and `src/features/tools/DotsPage.tsx` (import path)

**Interfaces:**
- Produces:
  - `parseNumber(text: string): number | null` in `src/lib/numbers.ts`
  - `type BestInput = { weight: string; reps: string }`
  - `type BestCheck = { status: 'empty' } | { status: 'invalid'; error: string } | { status: 'ok'; weightKg: number; reps: number; e1rm: number }`
  - `checkBest(input: BestInput): BestCheck`
  - `checkStartingDate(date: string): string | null` (error message or null)
  - `startingTotal(checks: BestCheck[]): { total: number; count: number } | null`
  - `type StartingBest = { lift: LiftKey; exerciseId: string; weightKg: number; reps: number }`

- [ ] **Step 1: Move `parseNumber` to `src/lib/numbers.ts`**

```ts
/** Accepts full-width digits and a comma as the decimal mark. Empty or invalid → null. */
export function parseNumber(text: string): number | null {
  const normalized = text.normalize('NFKC').replace(/,/g, '.').trim()
  if (normalized === '') return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}
```

Delete the `parseNumber` function from `src/features/tools/PublicLayout.tsx`. In `OneRepMaxPage.tsx` and `DotsPage.tsx`, remove `parseNumber` from the `./PublicLayout` import and add `import { parseNumber } from '../../lib/numbers'`. In `PublicPages.test.tsx`, replace `import { parseNumber } from './PublicLayout'` with `import { parseNumber } from '../../lib/numbers'`.

Run: `npx tsc -b && npx vitest run src/features/tools`
Expected: no type errors; tools tests PASS.

- [ ] **Step 2: Write the failing tests**

`src/features/strength/startingBests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { localDate } from '../../lib/dates'
import { checkBest, checkStartingDate, startingTotal } from './startingBests'

describe('checkBest', () => {
  it('treats a row without weight as not entered, even with the default reps', () => {
    expect(checkBest({ weight: '', reps: '1' })).toEqual({ status: 'empty' })
    expect(checkBest({ weight: '  ', reps: '' })).toEqual({ status: 'empty' })
  })

  it('estimates 1RM with the app formula, accepting full-width digits and decimal commas', () => {
    expect(checkBest({ weight: '100', reps: '5' })).toEqual({ status: 'ok', weightKg: 100, reps: 5, e1rm: 112.5 })
    expect(checkBest({ weight: '１００，５', reps: '１' })).toEqual({ status: 'ok', weightKg: 100.5, reps: 1, e1rm: 100.5 })
  })

  it('asks for reps when only the weight is filled', () => {
    expect(checkBest({ weight: '100', reps: '' })).toEqual({ status: 'invalid', error: '重量と回数の両方を入れてください' })
  })

  it('rejects weights outside 0 < w <= 9999.9 or with more than one decimal', () => {
    const error = '重量は0より大きく9999.9kg以下、小数1桁までで入力してください'
    for (const weight of ['0', '-5', '10000', '60.25', 'abc']) {
      expect(checkBest({ weight, reps: '1' })).toEqual({ status: 'invalid', error })
    }
  })

  it('explains why more than 10 reps cannot be used, and rejects other bad reps', () => {
    expect(checkBest({ weight: '60', reps: '12' })).toEqual({
      status: 'invalid', error: '11回以上は推定の誤差が大きいため使えません。10回以下の記録を入れてください',
    })
    for (const reps of ['0', '2.5', 'x']) {
      expect(checkBest({ weight: '60', reps })).toEqual({ status: 'invalid', error: '回数は1〜10の整数で入力してください' })
    }
  })
})

describe('checkStartingDate', () => {
  it('accepts today and earlier, and rejects empty, future and malformed dates', () => {
    expect(checkStartingDate(localDate())).toBeNull()
    expect(checkStartingDate('2026-01-15')).toBeNull()
    expect(checkStartingDate('')).toBe('日付を選んでください')
    expect(checkStartingDate('2999-01-01')).toBe('今日以前の正しい日付を選んでください')
    expect(checkStartingDate('2026-02-30')).toBe('今日以前の正しい日付を選んでください')
  })
})

describe('startingTotal', () => {
  it('sums only valid rows and says how many lifts it covers', () => {
    const ok = (e1rm: number) => ({ status: 'ok' as const, weightKg: e1rm, reps: 1, e1rm })
    expect(startingTotal([ok(140), { status: 'empty' }, ok(180.5)])).toEqual({ total: 320.5, count: 2 })
    expect(startingTotal([{ status: 'empty' }, { status: 'invalid', error: 'x' }])).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/strength/startingBests.test.ts`
Expected: FAIL — cannot resolve `./startingBests`.

- [ ] **Step 4: Implement `src/features/strength/startingBests.ts`**

```ts
import { workoutDateISO } from '../../lib/dates'
import { InputError } from '../../lib/errors'
import { parseNumber } from '../../lib/numbers'
import { estimateOneRepMax, MAX_E1RM_REPS } from '../../lib/strength'
import type { LiftKey } from './strengthSnapshot'

export type BestInput = { weight: string; reps: string }

export type BestCheck =
  | { status: 'empty' }
  | { status: 'invalid'; error: string }
  | { status: 'ok'; weightKg: number; reps: number; e1rm: number }

export type StartingBest = { lift: LiftKey; exerciseId: string; weightKg: number; reps: number }

const WEIGHT_ERROR = '重量は0より大きく9999.9kg以下、小数1桁までで入力してください'
const REPS_ERROR = '回数は1〜10の整数で入力してください'

/** Reps has a default, so a row counts as entered only once its weight is filled. */
export function checkBest(input: BestInput): BestCheck {
  if (input.weight.trim() === '') return { status: 'empty' }
  if (input.reps.trim() === '') return { status: 'invalid', error: '重量と回数の両方を入れてください' }
  const weightKg = parseNumber(input.weight)
  if (weightKg === null || weightKg <= 0 || weightKg > 9999.9 || Math.abs(weightKg * 10 - Math.round(weightKg * 10)) > 1e-7) {
    return { status: 'invalid', error: WEIGHT_ERROR }
  }
  const reps = parseNumber(input.reps)
  if (reps === null || !Number.isInteger(reps) || reps < 1) return { status: 'invalid', error: REPS_ERROR }
  if (reps > MAX_E1RM_REPS) {
    return { status: 'invalid', error: '11回以上は推定の誤差が大きいため使えません。10回以下の記録を入れてください' }
  }
  return { status: 'ok', weightKg, reps, e1rm: estimateOneRepMax(weightKg, reps)! }
}

/** Same rules as saving a dated workout: a real date, today or earlier. */
export function checkStartingDate(date: string): string | null {
  try {
    workoutDateISO(date)
    return null
  } catch (error) {
    if (error instanceof InputError) return error.message
    throw error
  }
}

export function startingTotal(checks: BestCheck[]): { total: number; count: number } | null {
  const values = checks.flatMap((check) => (check.status === 'ok' ? [check.e1rm] : []))
  if (values.length === 0) return null
  return { total: Math.round(values.reduce((sum, v) => sum + v, 0) * 10) / 10, count: values.length }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/strength/startingBests.test.ts src/features/tools && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/numbers.ts src/features/strength/startingBests.ts src/features/strength/startingBests.test.ts src/features/tools
git commit -m "Check BIG3 starting bests and share number parsing with the calculators

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `saveStartingBests`

**Files:**
- Create: `src/features/strength/startingBestsQueries.ts`
- Test: `src/features/strength/startingBestsQueries.test.ts`

**Interfaces:**
- Consumes: `StartingBest` (Task 1); `findWorkoutOnDate(userId, date)`, `createDatedWorkout(userId, id, date)`, `fetchEditableWorkout(userId, id)`, `saveEditableSet(workoutId, set)` from `src/features/history/editorQueries.ts`; `deleteWorkoutIfEmpty(workoutId)` from `src/features/workout-log/queries.ts`.
- Produces:
  - `type StartingBestIds = { workoutId: string; setIds: Record<LiftKey, string> }`
  - `newStartingBestIds(): StartingBestIds`
  - `saveStartingBests(userId: string, date: string, entries: StartingBest[], ids: StartingBestIds): Promise<void>`

Note: the spec says to delete the own workout "if a previous attempt created it". Calling `deleteWorkoutIfEmpty(ids.workoutId)` whenever the target is a different workout is equivalent: for an ID that was never inserted the count is 0 and the delete matches no row.

- [ ] **Step 1: Write the failing tests**

`src/features/strength/startingBestsQueries.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  findWorkoutOnDate: vi.fn(), createDatedWorkout: vi.fn(), fetchEditableWorkout: vi.fn(), saveEditableSet: vi.fn(),
  deleteWorkoutIfEmpty: vi.fn(),
}))
vi.mock('../history/editorQueries', () => ({
  findWorkoutOnDate: m.findWorkoutOnDate, createDatedWorkout: m.createDatedWorkout,
  fetchEditableWorkout: m.fetchEditableWorkout, saveEditableSet: m.saveEditableSet,
}))
vi.mock('../workout-log/queries', () => ({ deleteWorkoutIfEmpty: m.deleteWorkoutIfEmpty }))
import { newStartingBestIds, saveStartingBests } from './startingBestsQueries'

const ids = { workoutId: 'own', setIds: { squat: 's-sq', bench: 's-be', deadlift: 's-dl' } }
const set = (id: string, exercise_id: string, set_index: number) => ({ id, exercise_id, set_index, weight_kg: 60, reps: 5, note: null, workout_id: 'x', created_at: '' })

beforeEach(() => {
  vi.resetAllMocks()
  m.createDatedWorkout.mockResolvedValue(undefined)
  m.saveEditableSet.mockResolvedValue(undefined)
  m.deleteWorkoutIfEmpty.mockResolvedValue(false)
})

describe('saveStartingBests', () => {
  it('creates the day with its own ID when the day has no workout, and saves one set per lift', async () => {
    m.findWorkoutOnDate.mockResolvedValue(null)
    m.fetchEditableWorkout.mockResolvedValue({ id: 'own', workout_sets: [] })
    await saveStartingBests('u1', '2026-09-01', [
      { lift: 'squat', exerciseId: 'squat', weightKg: 140, reps: 1 },
      { lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 5 },
    ], ids)
    expect(m.createDatedWorkout).toHaveBeenCalledWith('u1', 'own', '2026-09-01')
    expect(m.saveEditableSet.mock.calls).toEqual([
      ['own', { id: 's-sq', exercise_id: 'squat', weight_kg: 140, reps: 1, set_index: 1, note: null }],
      ['own', { id: 's-be', exercise_id: 'bench', weight_kg: 100, reps: 5, set_index: 1, note: null }],
    ])
    expect(m.deleteWorkoutIfEmpty).not.toHaveBeenCalled()
  })

  it('adds to an existing day after its sets, and clears an empty workout left by an earlier attempt', async () => {
    m.findWorkoutOnDate.mockResolvedValue('day')
    m.fetchEditableWorkout.mockResolvedValue({ id: 'day', workout_sets: [set('a', 'bench', 1), set('b', 'bench', 2)] })
    await saveStartingBests('u1', '2026-09-01', [{ lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 1 }], ids)
    expect(m.createDatedWorkout).not.toHaveBeenCalled()
    expect(m.saveEditableSet).toHaveBeenCalledWith('day', { id: 's-be', exercise_id: 'bench', weight_kg: 100, reps: 1, set_index: 3, note: null })
    expect(m.deleteWorkoutIfEmpty).toHaveBeenCalledWith('own')
  })

  it('keeps the same index for its own set on a retry, so numbers do not skip', async () => {
    m.findWorkoutOnDate.mockResolvedValue('own')
    m.fetchEditableWorkout.mockResolvedValue({ id: 'own', workout_sets: [set('s-sq', 'squat', 1)] })
    await saveStartingBests('u1', '2026-09-01', [{ lift: 'squat', exerciseId: 'squat', weightKg: 140, reps: 1 }], ids)
    expect(m.saveEditableSet).toHaveBeenCalledWith('own', expect.objectContaining({ id: 's-sq', set_index: 1 }))
  })

  it('numbers two lifts that share one exercise one after the other', async () => {
    m.findWorkoutOnDate.mockResolvedValue(null)
    m.fetchEditableWorkout.mockResolvedValue({ id: 'own', workout_sets: [] })
    await saveStartingBests('u1', '2026-09-01', [
      { lift: 'squat', exerciseId: 'same', weightKg: 140, reps: 1 },
      { lift: 'deadlift', exerciseId: 'same', weightKg: 180, reps: 1 },
    ], ids)
    expect(m.saveEditableSet.mock.calls.map(([, s]) => [s.id, s.set_index])).toEqual([['s-sq', 1], ['s-dl', 2]])
  })

  it('refuses an empty list and reports a workout that cannot be read back', async () => {
    await expect(saveStartingBests('u1', '2026-09-01', [], ids)).rejects.toThrow('1種目以上入れてください')
    m.findWorkoutOnDate.mockResolvedValue(null)
    m.fetchEditableWorkout.mockResolvedValue(null)
    await expect(saveStartingBests('u1', '2026-09-01', [{ lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 1 }], ids))
      .rejects.toThrow('記録を保存できませんでした')
  })

  it('makes distinct IDs for the workout and each lift', () => {
    const made = newStartingBestIds()
    expect(new Set([made.workoutId, ...Object.values(made.setIds)]).size).toBe(4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/strength/startingBestsQueries.test.ts`
Expected: FAIL — cannot resolve `./startingBestsQueries`.

- [ ] **Step 3: Implement `src/features/strength/startingBestsQueries.ts`**

```ts
import { InputError } from '../../lib/errors'
import { createDatedWorkout, fetchEditableWorkout, findWorkoutOnDate, saveEditableSet } from '../history/editorQueries'
import { deleteWorkoutIfEmpty } from '../workout-log/queries'
import type { StartingBest } from './startingBests'
import type { LiftKey } from './strengthSnapshot'

/** Generated once per visit to the page and reused on every retry, so a retry never duplicates. */
export type StartingBestIds = { workoutId: string; setIds: Record<LiftKey, string> }

export function newStartingBestIds(): StartingBestIds {
  return {
    workoutId: crypto.randomUUID(),
    setIds: { squat: crypto.randomUUID(), bench: crypto.randomUUID(), deadlift: crypto.randomUUID() },
  }
}

/**
 * Saves the bests as ordinary sets on the chosen day: into that day's workout if there is one,
 * otherwise into a new workout with our own ID. Sets are upserted by ID, so a retry overwrites
 * them (and moves them if the date changed) instead of adding more.
 */
export async function saveStartingBests(userId: string, date: string, entries: StartingBest[], ids: StartingBestIds): Promise<void> {
  if (entries.length === 0) throw new InputError('1種目以上入れてください')
  const existing = await findWorkoutOnDate(userId, date)
  const target = existing ?? ids.workoutId
  if (!existing) await createDatedWorkout(userId, ids.workoutId, date)
  const workout = await fetchEditableWorkout(userId, target)
  if (!workout) throw new Error('記録を保存できませんでした。もう一度お試しください')

  // Count from sets that are not ours, so a retry keeps its numbers.
  const own = new Set(Object.values(ids.setIds))
  const last = new Map<string, number>()
  for (const s of workout.workout_sets) {
    if (own.has(s.id)) continue
    last.set(s.exercise_id, Math.max(last.get(s.exercise_id) ?? 0, s.set_index))
  }
  for (const entry of entries) {
    const index = (last.get(entry.exerciseId) ?? 0) + 1
    last.set(entry.exerciseId, index)
    await saveEditableSet(target, {
      id: ids.setIds[entry.lift], exercise_id: entry.exerciseId, weight_kg: entry.weightKg, reps: entry.reps, set_index: index, note: null,
    })
  }
  // A failed attempt on another date may have left our own workout empty.
  if (target !== ids.workoutId) await deleteWorkoutIfEmpty(ids.workoutId)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/strength/startingBestsQueries.test.ts && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/strength/startingBestsQueries.ts src/features/strength/startingBestsQueries.test.ts
git commit -m "Save BIG3 starting bests as an ordinary workout, safe to retry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Home card

**Files:**
- Create: `src/features/home/StartingBestsCard.tsx`
- Test: `src/features/home/StartingBestsCard.test.tsx`
- Modify: `src/features/home/HomePage.tsx` (render the card between the calendar/BIG3 grid and 「今日のトレーニング」)
- Modify: `src/features/home/HomePage.test.tsx` (one case)

**Interfaces:**
- Consumes: `StrengthSnapshot` from `src/features/strength/strengthSnapshot.ts`; `useSession()` returning `{ userId }`.
- Produces: `StartingBestsCard({ snapshot }: { snapshot: StrengthSnapshot | null })` — renders nothing unless `snapshot` is non-null, all three `snapshot.lifts.*.allTimeE1rm` are `null`, and the person has not dismissed it. Dismissal key: `glog:big3-start-dismissed:<userId>`.

- [ ] **Step 1: Write the failing tests**

`src/features/home/StartingBestsCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildStrengthSnapshot } from '../strength/strengthSnapshot'
import { StartingBestsCard } from './StartingBestsCard'

vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

const EXERCISES = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
]
const empty = buildStrengthSnapshot(EXERCISES, [], [])
const withBench = buildStrengthSnapshot(EXERCISES, [], [{ exercise_id: 'bench', weight_kg: 80, reps: 5, performed_at: '2026-09-01T03:00:00Z' }])
const show = (snapshot: Parameters<typeof StartingBestsCard>[0]['snapshot']) =>
  render(<MemoryRouter><StartingBestsCard snapshot={snapshot} /></MemoryRouter>)

describe('StartingBestsCard', () => {
  beforeEach(() => localStorage.clear())

  it('invites people with no BIG3 record to enter their bests', () => {
    show(empty)
    expect(screen.getByRole('heading', { name: '前のアプリから乗り換え？' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ベストを入れて始める' })).toHaveAttribute('href', '/big3/start')
  })

  it('stays hidden once any lift has a record, and while the BIG3 data is missing', () => {
    show(withBench)
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
    show(null)
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
  })

  it('never comes back for this person after closing it', async () => {
    const { unmount } = show(empty)
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
    expect(localStorage.getItem('glog:big3-start-dismissed:u1')).toBe('1')
    unmount()
    show(empty)
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
  })
})
```

Add to `src/features/home/HomePage.test.tsx` inside `describe('HomePage', ...)` (uses that file's existing mocks, `EXERCISES`, `fetchMonthWorkouts`, `fetchStrengthSnapshot`):

```tsx
  it('does not offer the starting bests while the BIG3 data failed to load', async () => {
    fetchMonthWorkouts.mockResolvedValue([])
    fetchStrengthSnapshot.mockRejectedValue(new Error('network'))
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    // toMessage shows a generic message for an unexpected Error.
    expect(await screen.findByText('エラーが発生しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
  })

  it('offers the starting bests to someone with no BIG3 record', async () => {
    localStorage.clear()
    fetchMonthWorkouts.mockResolvedValue([])
    fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot([...EXERCISES], [], []))
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: '前のアプリから乗り換え？' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/home`
Expected: FAIL — `./StartingBestsCard` cannot be resolved; the HomePage "offers" case cannot find the heading.

- [ ] **Step 3: Implement `src/features/home/StartingBestsCard.tsx`**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { LIFT_KEYS, type StrengthSnapshot } from '../strength/strengthSnapshot'

const key = (userId: string) => `glog:big3-start-dismissed:${userId}`

function readDismissed(userId: string | null): boolean {
  if (!userId) return false
  try { return localStorage.getItem(key(userId)) === '1' } catch { return false }
}

/** For people switching from another app: start from their BIG3 bests instead of an empty history. */
export function StartingBestsCard({ snapshot }: { snapshot: StrengthSnapshot | null }) {
  const { userId } = useSession()
  const [dismissed, setDismissed] = useState(() => readDismissed(userId))
  // Without the BIG3 data we cannot tell "no records" from "failed to load", so show nothing.
  if (!snapshot || dismissed || LIFT_KEYS.some((lift) => snapshot.lifts[lift].allTimeE1rm !== null)) return null

  function dismiss() {
    setDismissed(true)
    try { if (userId) localStorage.setItem(key(userId), '1') } catch { /* stays hidden for this visit */ }
  }

  return <section aria-labelledby="starting-bests-title" className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <h2 id="starting-bests-title" className="font-semibold">前のアプリから乗り換え？</h2>
    <p className="text-sm leading-relaxed text-muted">BIG3のベストを入れると、今日から合計・推定1RM・ランキングが使えます</p>
    <div className="flex gap-2">
      <Link to="/big3/start" className="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-white">ベストを入れて始める</Link>
      <button type="button" onClick={dismiss} className="min-h-14 rounded-xl px-4 text-sm text-muted">閉じる</button>
    </div>
  </section>
}
```

- [ ] **Step 4: Render it in `src/features/home/HomePage.tsx`**

Add the import next to `StartTrainingCard`:

```tsx
import { StartingBestsCard } from './StartingBestsCard'
```

Insert directly after the closing `</div>` of the `grid grid-cols-[3fr_2fr]` block and before `<section aria-label="今日のトレーニング"`:

```tsx
    <StartingBestsCard snapshot={strengthError ? null : snapshot} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/home && npx tsc -b`
Expected: PASS (all existing HomePage tests too), no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/home
git commit -m "Offer BIG3 starting bests on home to people with no BIG3 record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Starting bests page and route

**Files:**
- Create: `src/features/strength/StartingBestsPage.tsx`
- Test: `src/features/strength/StartingBestsPage.test.tsx`
- Modify: `src/App.tsx` (lazy import + route `/big3/start` inside the `AppShell` routes, next to `/big3`)

**Interfaces:**
- Consumes: `checkBest`, `checkStartingDate`, `startingTotal`, `BestInput`, `BestCheck`, `StartingBest` (Task 1); `saveStartingBests`, `newStartingBestIds` (Task 2); `fetchStrengthSnapshot(userId)` from `./queries`; `LIFT_KEYS`, `LIFT_LABELS` from `./strengthSnapshot`; `invalidateMonthWorkouts()` from `../history/useMonthWorkouts`; `useToast().show(message)`; `toMessage(error)` from `../../lib/errors`; `localDate()` from `../../lib/dates`.
- Produces: `StartingBestsPage()` (no props).

- [ ] **Step 1: Write the failing tests**

`src/features/strength/StartingBestsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildStrengthSnapshot } from './strengthSnapshot'

const m = vi.hoisted(() => ({ fetchStrengthSnapshot: vi.fn(), saveStartingBests: vi.fn(), show: vi.fn(), invalidateMonthWorkouts: vi.fn() }))
vi.mock('./queries', () => ({ fetchStrengthSnapshot: m.fetchStrengthSnapshot }))
vi.mock('./startingBestsQueries', async (original) => ({ ...await original<typeof import('./startingBestsQueries')>(), saveStartingBests: m.saveStartingBests }))
vi.mock('../history/useMonthWorkouts', () => ({ invalidateMonthWorkouts: m.invalidateMonthWorkouts }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ show: m.show }) }))
import { StartingBestsPage } from './StartingBestsPage'

const EXERCISES = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
]
function open() {
  return render(<MemoryRouter initialEntries={['/big3/start']}><Routes>
    <Route path="/big3/start" element={<StartingBestsPage />} />
    <Route path="/big3" element={<p>BIG3画面</p>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  m.fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot(EXERCISES, [], []))
  m.saveStartingBests.mockResolvedValue(undefined)
})

describe('StartingBestsPage', () => {
  it('saves only the lifts entered, on the chosen date, then shows BIG3', async () => {
    open()
    await userEvent.type(await screen.findByLabelText('スクワットの重量'), '140')
    await userEvent.type(screen.getByLabelText('ベンチプレスの重量'), '100')
    await userEvent.clear(screen.getByLabelText('ベンチプレスの回数'))
    await userEvent.type(screen.getByLabelText('ベンチプレスの回数'), '5')
    expect(screen.getByText('2種目の合計')).toBeInTheDocument()
    expect(screen.getByText('252.5')).toBeInTheDocument()
    const date = screen.getByLabelText('いつ頃の記録？')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-09-01')
    await userEvent.click(screen.getByRole('button', { name: 'BIG3を登録' }))
    expect(m.saveStartingBests).toHaveBeenCalledWith('u1', '2026-09-01', [
      { lift: 'squat', exerciseId: 'squat', weightKg: 140, reps: 1 },
      { lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 5 },
    ], expect.objectContaining({ workoutId: expect.any(String) }))
    expect(await screen.findByText('BIG3画面')).toBeInTheDocument()
    expect(m.show).toHaveBeenCalledWith('BIG3を登録しました')
    expect(m.invalidateMonthWorkouts).toHaveBeenCalled()
  })

  it('cannot save with nothing entered or with an invalid row', async () => {
    open()
    const save = await screen.findByRole('button', { name: 'BIG3を登録' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('デッドリフトの重量'), '200')
    await userEvent.clear(screen.getByLabelText('デッドリフトの回数'))
    await userEvent.type(screen.getByLabelText('デッドリフトの回数'), '12')
    expect(screen.getByText(/11回以上は推定の誤差が大きいため使えません/)).toBeInTheDocument()
    expect(save).toBeDisabled()
  })

  it('keeps the input and the same IDs when saving fails, and saves on retry', async () => {
    m.saveStartingBests.mockRejectedValueOnce(new Error('通信できませんでした'))
    open()
    await userEvent.type(await screen.findByLabelText('ベンチプレスの重量'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'BIG3を登録' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました。もう一度お試しください。')
    expect(screen.getByLabelText('ベンチプレスの重量')).toHaveValue('100')
    await userEvent.click(screen.getByRole('button', { name: 'BIG3を登録' }))
    expect(await screen.findByText('BIG3画面')).toBeInTheDocument()
    const [first, second] = m.saveStartingBests.mock.calls
    expect(second[3]).toBe(first[3])
  })

  it('shows a load failure with a retry instead of empty rows', async () => {
    m.fetchStrengthSnapshot.mockRejectedValueOnce(new Error('読み込めませんでした'))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました。もう一度お試しください。')
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByLabelText('スクワットの重量')).toBeInTheDocument()
  })

  it('points to the BIG3 settings for a lift without an exercise', async () => {
    m.fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot(EXERCISES.filter((e) => e.id !== 'deadlift'), [], []))
    open()
    expect(await screen.findByRole('link', { name: 'BIG3の設定で種目を選んでください' })).toHaveAttribute('href', '/big3')
    expect(screen.queryByLabelText('デッドリフトの重量')).not.toBeInTheDocument()
  })
})
```

(`toMessage` in `src/lib/errors.ts` shows 「エラーが発生しました。もう一度お試しください。」 for an unexpected `Error`; network failures get their own text. The tests assert the generic one.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/strength/StartingBestsPage.test.tsx`
Expected: FAIL — cannot resolve `./StartingBestsPage`.

- [ ] **Step 3: Implement `src/features/strength/StartingBestsPage.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { localDate } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import { useSession } from '../auth/SessionProvider'
import { invalidateMonthWorkouts } from '../history/useMonthWorkouts'
import { fetchStrengthSnapshot } from './queries'
import { checkBest, checkStartingDate, startingTotal, type BestInput, type StartingBest } from './startingBests'
import { newStartingBestIds, saveStartingBests } from './startingBestsQueries'
import { LIFT_KEYS, LIFT_LABELS, type LiftKey, type StrengthSnapshot } from './strengthSnapshot'

const field = 'mt-1 min-h-14 w-full rounded-xl border border-border bg-bg px-4 text-fg tabular-nums'
const kg = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

export function StartingBestsPage() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()
  const [snapshot, setSnapshot] = useState<StrengthSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inputs, setInputs] = useState<Record<LiftKey, BestInput>>({
    squat: { weight: '', reps: '1' }, bench: { weight: '', reps: '1' }, deadlift: { weight: '', reps: '1' },
  })
  const [date, setDate] = useState(() => localDate())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Same IDs for every retry during this visit, so a lost response never duplicates sets.
  const ids = useRef(newStartingBestIds())

  const load = useCallback(() => {
    if (!userId) return
    setLoadError(null); setSnapshot(null)
    fetchStrengthSnapshot(userId).then(setSnapshot).catch((e: unknown) => setLoadError(toMessage(e)))
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loadError) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{loadError}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!snapshot) return <Spinner />

  const rows = LIFT_KEYS.map((lift) => ({ lift, info: snapshot.lifts[lift], check: checkBest(inputs[lift]) }))
  const usable = rows.filter((row) => row.info.exerciseId !== null)
  const dateError = checkStartingDate(date)
  const total = startingTotal(usable.map((row) => row.check))
  const entries: StartingBest[] = usable.flatMap((row) => row.check.status === 'ok'
    ? [{ lift: row.lift, exerciseId: row.info.exerciseId!, weightKg: row.check.weightKg, reps: row.check.reps }] : [])
  const canSave = !saving && entries.length > 0 && dateError === null && usable.every((row) => row.check.status !== 'invalid')

  function update(lift: LiftKey, key: keyof BestInput, value: string) {
    setInputs((current) => ({ ...current, [lift]: { ...current[lift], [key]: value } }))
  }

  async function save() {
    if (!userId || !canSave) return
    setSaving(true); setSaveError(null)
    try {
      await saveStartingBests(userId, date, entries, ids.current)
      invalidateMonthWorkouts()
      show('BIG3を登録しました')
      navigate('/big3')
    } catch (e: unknown) {
      setSaveError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return <section className="space-y-6 p-4">
    <div>
      <h1 className="text-2xl font-semibold">BIG3のベストを入れる</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">今のベストを入れると、推定1RM・合計・ランキングがすぐ使えます。入れたい種目だけで大丈夫です。1回だけ挙げた重量なら回数は1のまま、5回挙げた重量なら5にします。</p>
    </div>
    {rows.map(({ lift, info, check }) => {
      const name = info.exerciseName ?? LIFT_LABELS[lift]
      return <fieldset key={lift} className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 font-semibold">{name}</legend>
        {info.exerciseId === null
          ? <Link to="/big3" className="flex min-h-14 items-center text-sm text-accent">BIG3の設定で種目を選んでください</Link>
          : <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-muted">重量（kg）
                <input aria-label={`${name}の重量`} inputMode="decimal" autoComplete="off" value={inputs[lift].weight}
                  onChange={(e) => update(lift, 'weight', e.target.value)} className={field} />
              </label>
              <label className="block text-sm text-muted">回数
                <input aria-label={`${name}の回数`} inputMode="numeric" autoComplete="off" value={inputs[lift].reps}
                  onChange={(e) => update(lift, 'reps', e.target.value)} className={field} />
              </label>
            </div>
            {check.status === 'invalid' && <p className="text-sm text-accent">{check.error}</p>}
            {check.status === 'ok' && <p className="text-sm text-muted">推定1RM <span className="font-semibold text-fg tabular-nums">{kg(check.e1rm)}</span> kg</p>}
          </>}
      </fieldset>
    })}
    <div className="rounded-xl border border-border bg-surface p-4" aria-live="polite">
      <p className="text-xs text-muted">{total && total.count < 3 ? `${total.count}種目の合計` : 'BIG3合計'}</p>
      <p className="text-3xl font-bold tabular-nums">{total ? kg(total.total) : '—'}<span className="ml-1 text-base font-normal text-muted">kg</span></p>
    </div>
    <label className="block text-sm text-muted">いつ頃の記録？
      <input type="date" aria-label="いつ頃の記録？" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} className={field} />
      {dateError && <span className="mt-1 block text-sm text-accent">{dateError}</span>}
    </label>
    {saveError && <p role="alert" className="text-sm text-accent">{saveError}</p>}
    <Button onClick={save} disabled={!canSave}>{saving ? '登録中…' : 'BIG3を登録'}</Button>
    <p className="text-xs leading-relaxed text-muted">選んだ日の記録として保存します。あとから履歴の画面で直したり消したりできます。</p>
  </section>
}
```

Notes for the implementer:
- `startingTotal(...)` returns the sum of the entered lifts; the label says 「◯種目の合計」 unless all three are entered (spec: 「3種目そろっていなければ『◯種目の合計』と明記」).
- The 再試行 after a save failure is the same 「BIG3を登録」 button (the inputs and IDs stay), which matches the spec's 「［再試行］を出す」 intent without a second button doing the same thing. If a reviewer requires a literal 再試行 label, render `{saveError ? '再試行' : 'BIG3を登録'}` and update the tests' button name for the second click.
- The date input carries `aria-label="いつ頃の記録？"` so its accessible name stays exact even while an error is shown inside the label.

- [ ] **Step 4: Add the route in `src/App.tsx`**

Next to the other lazy imports:

```tsx
const StartingBestsPage = lazy(() => import('./features/strength/StartingBestsPage').then((m) => ({ default: m.StartingBestsPage })))
```

Directly after `<Route path="/big3" element={<Big3Page />} />`:

```tsx
                <Route path="/big3/start" element={<StartingBestsPage />} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/strength src/features/home && npx tsc -b && npm run lint`
Expected: PASS; no type errors; lint 0 errors (2 existing warnings).

- [ ] **Step 6: Commit**

```bash
git add src/features/strength/StartingBestsPage.tsx src/features/strength/StartingBestsPage.test.tsx src/App.tsx
git commit -m "Let new users enter their BIG3 bests and a date to start from

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mock E2E, full verification and handover note

**Files:**
- Modify: `tests/e2e/simple-flow.spec.ts` (append one test; it reuses `mockApi`, which signs in and leaves the page on `/log`)
- Modify: `CLAUDE.md` (one entry at the top of 「再開時の注意」)

**Interfaces:**
- Consumes: everything above; `mockApi(page)` from the same spec file returns `{ sets, workouts, ... }` (in-memory rows).

- [ ] **Step 1: Write the E2E test**

Append to `tests/e2e/simple-flow.spec.ts`:

```ts
test('a new user starts from BIG3 bests entered on home and sees them in BIG3', async ({ page }) => {
  const data = await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '前のアプリから乗り換え？' })).toBeVisible()
  const start = page.getByRole('link', { name: 'ベストを入れて始める' })
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(56)
  await start.click()

  await page.getByLabel('スクワットの重量').fill('140')
  await page.getByLabel('ベンチプレスの重量').fill('100')
  await page.getByLabel('ベンチプレスの回数').fill('5')
  await expect(page.getByText('2種目の合計')).toBeVisible()
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByRole('button', { name: 'BIG3を登録' }).click()

  await expect(page).toHaveURL(/\/big3$/)
  expect(data.sets.map((s) => [s.exercise_id, s.weight_kg, s.reps, s.set_index]).sort()).toEqual([['bench', 100, 5, 1], ['squat', 140, 1, 1]])
  expect(data.workouts).toHaveLength(1)

  await page.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: 'ホーム', exact: true }).click()
  await expect(page.getByRole('region', { name: '今月のトレーニング' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '前のアプリから乗り換え？' })).toHaveCount(0)
})
```

If the BIG3 screen's own heading/total text is stable (read `src/features/community/Big3Page.tsx`), also assert the total there, e.g. `await expect(page.getByText('252.5').first()).toBeVisible()`.

- [ ] **Step 2: Run the new E2E test**

Run: `npx playwright test --config playwright.mock.config.ts simple-flow -g "starts from BIG3 bests" --workers=1`
Expected: PASS. If it fails on the mock (e.g. a query shape the mock does not answer), fix the mock in `mockApi` only if the app's request is correct; never change app behaviour to satisfy the mock.

- [ ] **Step 3: Run the full verification**

Run, in order, and confirm each:
- `npx tsc -b` — no output
- `npm run lint` — `0 errors` (2 known warnings)
- `npx vitest run` — all pass
- `node supabase/tests/sql-runtime/run-sql.mjs` — every suite `PASS` (unchanged SQL, sanity only)
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build` — succeeds, prints `prerendered /calculators/1rm`
- `npm run test:e2e:mock` — all pass (CI runs these in parallel; if a test flakes only in parallel, re-run it with `--repeat-each=3 --workers=3` and fix the race in the test, as done in `fefd300`)

- [ ] **Step 4: Add the handover note to `CLAUDE.md`**

Insert as the first bullet under `## 再開時の注意`:

```markdown
- 2026-10-07: 乗り換え層向けに「BIG3のベストを入れて始める」を追加（設計 `docs/superpowers/specs/2026-10-07-big3-starting-bests-design.md`）。BIG3が3種目とも空の人にホームでカードを出し（閉じると端末に `glog:big3-start-dismissed:<userId>`）、`/big3/start` で重量×回数（1〜10回）と日付を入れると、その日の普通のワークアウトとして保存する（`saveStartingBests`、IDを使い回して再送でも重複しない）。DB変更なし。お知らせは足していない（既存の利用者はBIG3の記録があるのでカードが出ない）。iPhone実機確認は未実施。
```

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/simple-flow.spec.ts CLAUDE.md
git commit -m "Cover starting from BIG3 bests end to end and note it for handover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Stop before pushing**

Report the verification results to the owner and ask for permission to push (`git fetch` first; Codex also pushes to `master`). After pushing, watch CI with `gh run list --limit 1` / `gh run watch <id> --exit-status`.
