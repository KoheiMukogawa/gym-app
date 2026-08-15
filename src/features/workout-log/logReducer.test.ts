import { describe, it, expect } from 'vitest'
import { logReducer, initialLogState, nextSet } from './logReducer'
import type { LogState } from './logReducer'

const withExercise = (): LogState =>
  logReducer(initialLogState, {
    type: 'select-exercise',
    exerciseId: 'bench',
    prefill: { weight_kg: 80, reps: 8 },
  })

describe('logReducer', () => {
  it('applies the prefill when an exercise is selected', () => {
    const state = withExercise()
    expect(state.currentExerciseId).toBe('bench')
    expect(state.weight_kg).toBe(80)
    expect(state.reps).toBe(8)
  })

  it('falls back to defaults when there is no prefill', () => {
    const state = logReducer(initialLogState, {
      type: 'select-exercise',
      exerciseId: 'bench',
      prefill: null,
    })
    expect(state.weight_kg).toBe(20)
    expect(state.reps).toBe(10)
  })

  it('records a set with one action when the prefill is kept', () => {
    const state = logReducer(withExercise(), { type: 'complete-set', id: 's1' })
    expect(state.sets).toEqual([
      { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 },
    ])
  })

  it('keeps the weight and reps after completing a set, for the next set', () => {
    const state = logReducer(withExercise(), { type: 'complete-set', id: 's1' })
    expect(state.weight_kg).toBe(80)
    expect(state.reps).toBe(8)
  })

  it('numbers set_index per exercise, starting at 1', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'complete-set', id: 's1' })
    state = logReducer(state, { type: 'complete-set', id: 's2' })
    state = logReducer(state, {
      type: 'select-exercise',
      exerciseId: 'squat',
      prefill: null,
    })
    state = logReducer(state, { type: 'complete-set', id: 's3' })

    expect(state.sets.map((s) => [s.exercise_id, s.set_index])).toEqual([
      ['bench', 1],
      ['bench', 2],
      ['squat', 1],
    ])
  })

  it('carries forward the last logged values when re-selecting an exercise, ignoring new prefill', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'complete-set', id: 's1' })
    // Now re-select bench with a different prefill - should use the logged values, not this prefill
    state = logReducer(state, {
      type: 'select-exercise',
      exerciseId: 'bench',
      prefill: { weight_kg: 75, reps: 5 },
    })
    expect(state.weight_kg).toBe(80)
    expect(state.reps).toBe(8)
  })

  it('adjusts weight and reps by the configured step', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'adjust-weight', direction: 1 })
    state = logReducer(state, { type: 'adjust-reps', direction: -1 })
    expect(state.weight_kg).toBe(82.5)
    expect(state.reps).toBe(7)
  })

  it('accepts direct numeric entry', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'set-weight', value: 62.5 })
    state = logReducer(state, { type: 'set-reps', value: 12 })
    expect(state.weight_kg).toBe(62.5)
    expect(state.reps).toBe(12)
  })

  it('rounds direct weight entry to one decimal place, matching the numeric(5,1) column', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'set-weight', value: 62.567 })
    expect(state.weight_kg).toBe(62.6)
  })

  it('clamps direct entry to the allowed range', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'set-weight', value: -5 })
    state = logReducer(state, { type: 'set-reps', value: 0 })
    expect(state.weight_kg).toBe(0)
    expect(state.reps).toBe(1)
  })

  it('undoes the most recent set only', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'complete-set', id: 's1' })
    state = logReducer(state, { type: 'adjust-weight', direction: 1 })
    state = logReducer(state, { type: 'complete-set', id: 's2' })
    state = logReducer(state, { type: 'undo-last-set' })

    expect(state.sets).toEqual([
      { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 },
    ])
  })

  it('ignores undo when nothing has been recorded', () => {
    const state = logReducer(withExercise(), { type: 'undo-last-set' })
    expect(state.sets).toEqual([])
  })

  it('ignores complete-set when no exercise is selected', () => {
    const state = logReducer(initialLogState, { type: 'complete-set', id: 's1' })
    expect(state.sets).toEqual([])
  })
})

describe('nextSet', () => {
  it('returns null when no exercise is selected', () => {
    expect(nextSet(initialLogState, 's1')).toBeNull()
  })

  it('describes the set that complete-set would record', () => {
    const state = withExercise()
    const predicted = nextSet(state, 's1')
    const after = logReducer(state, { type: 'complete-set', id: 's1' })
    expect(predicted).toEqual(after.sets[0])
  })

  it('stays in step with complete-set across multiple sets', () => {
    let state = withExercise()
    state = logReducer(state, { type: 'complete-set', id: 's1' })
    const predicted = nextSet(state, 's2')
    const after = logReducer(state, { type: 'complete-set', id: 's2' })
    expect(predicted).toEqual(after.sets[1])
  })
})
