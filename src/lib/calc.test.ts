import { describe, it, expect } from 'vitest'
import {
  normalizeExerciseName,
  totalVolume,
  personalBest,
  findPrefill,
  maxWeightByDate,
  adjustWeight,
  adjustReps,
} from './calc'
import type { SetWithDate } from './types'

describe('normalizeExerciseName', () => {
  it('lowercases and strips whitespace', () => {
    expect(normalizeExerciseName(' Bench Press ')).toBe('benchpress')
  })

  it('treats full-width and half-width spaces the same', () => {
    expect(normalizeExerciseName('ベンチ　プレス')).toBe('ベンチプレス')
  })
})

describe('totalVolume', () => {
  it('sums weight times reps', () => {
    expect(totalVolume([
      { weight_kg: 80, reps: 8 },
      { weight_kg: 80, reps: 6 },
    ])).toBe(1120)
  })

  it('returns 0 for an empty list', () => {
    expect(totalVolume([])).toBe(0)
  })
})

describe('personalBest', () => {
  it('returns the heaviest weight', () => {
    expect(personalBest([
      { weight_kg: 80 },
      { weight_kg: 100 },
      { weight_kg: 90 },
    ])).toBe(100)
  })

  it('returns null for an empty list', () => {
    expect(personalBest([])).toBeNull()
  })
})

describe('findPrefill', () => {
  const history = [
    { exercise_id: 'squat', weight_kg: 100, reps: 5 },
    { exercise_id: 'bench', weight_kg: 80, reps: 8 },
    { exercise_id: 'bench', weight_kg: 75, reps: 10 },
  ]

  it('returns the first matching entry, since history is newest first', () => {
    expect(findPrefill(history, 'bench')).toEqual({ weight_kg: 80, reps: 8 })
  })

  it('returns null when the exercise has no history', () => {
    expect(findPrefill(history, 'deadlift')).toBeNull()
  })
})

describe('maxWeightByDate', () => {
  const set = (id: string, performed_at: string, weight_kg: number): SetWithDate => ({
    id,
    workout_id: 'w',
    exercise_id: 'bench',
    set_index: 1,
    weight_kg,
    reps: 8,
    created_at: performed_at,
    performed_at,
  })

  it('keeps the heaviest set per day, sorted oldest first', () => {
    expect(maxWeightByDate([
      set('a', '2026-08-10T10:00:00Z', 80),
      set('b', '2026-08-10T10:30:00Z', 85),
      set('c', '2026-08-03T10:00:00Z', 75),
    ])).toEqual([
      { date: '2026-08-03', max_weight: 75 },
      { date: '2026-08-10', max_weight: 85 },
    ])
  })

  it('returns an empty array for no sets', () => {
    expect(maxWeightByDate([])).toEqual([])
  })
})

describe('adjustWeight', () => {
  it('steps up by 2.5', () => {
    expect(adjustWeight(80, 1)).toBe(82.5)
  })

  it('steps down by 2.5', () => {
    expect(adjustWeight(80, -1)).toBe(77.5)
  })

  it('never goes below 0', () => {
    expect(adjustWeight(1, -1)).toBe(0)
  })

  it('avoids floating point drift', () => {
    expect(adjustWeight(0.1, 1)).toBe(2.6)
  })
})

describe('adjustReps', () => {
  it('steps by 1', () => {
    expect(adjustReps(8, 1)).toBe(9)
  })

  it('never goes below 1', () => {
    expect(adjustReps(1, -1)).toBe(1)
  })
})
