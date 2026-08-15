import { describe, it, expect, beforeEach } from 'vitest'
import { saveDraft, loadDraft, clearDraft } from './persistence'
import { initialLogState } from './logReducer'
import type { LogState } from './logReducer'

const USER = 'user-1'

const STATE: LogState = {
  currentExerciseId: 'bench',
  weight_kg: 80,
  reps: 8,
  sets: [{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }],
}

const STATUS = { s1: 'saved' as const }

function today(): string {
  return new Date().toISOString().slice(0, 10)
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
})
