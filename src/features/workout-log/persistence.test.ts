import { describe, it, expect, beforeEach } from 'vitest'
import { saveDraft, loadDraft, clearDraft } from './persistence'
import { initialLogState } from './logReducer'
import type { LogState } from './logReducer'

const STATE: LogState = {
  currentExerciseId: 'bench',
  weight_kg: 80,
  reps: 8,
  sets: [{ exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }],
}

describe('workout draft persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing was saved', () => {
    expect(loadDraft()).toBeNull()
  })

  it('round-trips the state and workout id', () => {
    saveDraft({ state: STATE, workoutId: 'w1' })
    expect(loadDraft()).toEqual({ state: STATE, workoutId: 'w1' })
  })

  it('does not save a draft that has no exercise and no sets', () => {
    saveDraft({ state: initialLogState, workoutId: null })
    expect(loadDraft()).toBeNull()
  })

  it('clears the draft', () => {
    saveDraft({ state: STATE, workoutId: 'w1' })
    clearDraft()
    expect(loadDraft()).toBeNull()
  })

  it('discards a draft that is not valid JSON', () => {
    localStorage.setItem('gym-app.draft', 'not json')
    expect(loadDraft()).toBeNull()
  })

  it('discards a draft with an unexpected shape', () => {
    localStorage.setItem('gym-app.draft', JSON.stringify({ state: { weight_kg: 80 } }))
    expect(loadDraft()).toBeNull()
  })
})
