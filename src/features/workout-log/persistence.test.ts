import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveDraft, loadDraft, clearDraft } from './persistence'
import { initialLogState } from './logReducer'
import type { LogState } from './logReducer'

// このテストファイルは実行環境（Node）の process.env.TZ を切り替えてタイムゾーンを
// 固定するが、プロジェクトの tsconfig は vite/client の型しか読み込んでいないため
// Node のグローバル型が無い。@types/node をプロジェクト全体に広げる代わりに、
// ここで使う分だけ最小限にアンビエント宣言する。
declare const process: { env: Record<string, string | undefined> }

const USER = 'user-1'

const STATE: LogState = {
  currentExerciseId: 'bench',
  weight_kg: 80,
  reps: 8,
  sets: [{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }],
}

const STATUS = { s1: 'saved' as const }

function today(): string {
  return new Date().toLocaleDateString('sv-SE')
}

describe('workout draft persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing was saved', () => {
    expect(loadDraft(USER)).toBeNull()
  })

  it('round-trips the state, workout id, and per-set status', () => {
    saveDraft(USER, { state: STATE, workoutId: 'w1', status: STATUS })
    expect(loadDraft(USER)).toEqual({ state: STATE, workoutId: 'w1', status: STATUS })
  })

  it('does not save a draft that has no exercise and no sets', () => {
    saveDraft(USER, { state: initialLogState, workoutId: null, status: {} })
    expect(loadDraft(USER)).toBeNull()
  })

  it('clears the draft', () => {
    saveDraft(USER, { state: STATE, workoutId: 'w1', status: STATUS })
    clearDraft(USER)
    expect(loadDraft(USER)).toBeNull()
  })

  it('discards a draft that is not valid JSON', () => {
    localStorage.setItem('gym-app.draft.user-1', 'not json')
    expect(loadDraft(USER)).toBeNull()
  })

  it('discards a draft with an unexpected shape', () => {
    localStorage.setItem('gym-app.draft.user-1', JSON.stringify({ state: { weight_kg: 80 } }))
    expect(loadDraft(USER)).toBeNull()
  })

  it('discards a draft with a malformed status map', () => {
    localStorage.setItem(
      'gym-app.draft.user-1',
      JSON.stringify({
        state: STATE,
        workoutId: 'w1',
        status: { s1: 'not-a-real-status' },
        userId: USER,
        date: today(),
      }),
    )
    expect(loadDraft(USER)).toBeNull()
  })

  it('namespaces drafts by user, so one user never sees another user in-progress workout', () => {
    saveDraft(USER, { state: STATE, workoutId: 'w1', status: STATUS })
    expect(loadDraft('user-2')).toBeNull()
  })

  it('discards a draft whose embedded owner does not match the requesting user', () => {
    // 何らかの理由でキーと中身の userId が食い違った場合の二重の防御
    localStorage.setItem(
      'gym-app.draft.user-1',
      JSON.stringify({
        state: STATE,
        workoutId: 'w1',
        status: STATUS,
        userId: 'someone-else',
        date: today(),
      }),
    )
    expect(loadDraft(USER)).toBeNull()
  })

  it('discards a draft that was not created today', () => {
    localStorage.setItem(
      'gym-app.draft.user-1',
      JSON.stringify({
        state: STATE,
        workoutId: 'w1',
        status: STATUS,
        userId: USER,
        date: '2000-01-01',
      }),
    )
    expect(loadDraft(USER)).toBeNull()
  })

  it('removes the pre-namespacing legacy key on load, so it does not linger forever', () => {
    localStorage.setItem('gym-app.draft', JSON.stringify({ some: 'stale shape' }))
    loadDraft(USER)
    expect(localStorage.getItem('gym-app.draft')).toBeNull()
  })
})

describe('workout draft persistence — local calendar date, not UTC', () => {
  const originalTZ = process.env.TZ

  beforeEach(() => {
    localStorage.clear()
    process.env.TZ = 'Asia/Tokyo'
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTZ
  })

  it('keeps a draft across a UTC midnight rollover as long as the local (JST) day has not changed', () => {
    // 2026-08-14T23:00:00Z = 2026-08-15 08:00 JST。UTC基準の日付だと保存時は
    // 8/14 だが、これは日本のユーザーにとってはまだ 8/15 の朝の記録である。
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T23:00:00Z'))
    saveDraft(USER, { state: STATE, workoutId: 'w1', status: STATUS })

    // UTC の日付はまたいだが (8/14 -> 8/15)、JST の暦日はまだ同じ 8/15 のまま。
    vi.setSystemTime(new Date('2026-08-15T01:00:00Z'))
    expect(loadDraft(USER)).toEqual({ state: STATE, workoutId: 'w1', status: STATUS })
  })

  it('still discards a draft once the local (JST) day actually changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T23:00:00Z')) // 2026-08-15 08:00 JST
    saveDraft(USER, { state: STATE, workoutId: 'w1', status: STATUS })

    vi.setSystemTime(new Date('2026-08-15T16:00:00Z')) // 2026-08-16 01:00 JST — 翌日
    expect(loadDraft(USER)).toBeNull()
  })
})
