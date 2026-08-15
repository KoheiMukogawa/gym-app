import { describe, it, expect } from 'vitest'
import { maxWeightByDate, personalBest, totalVolume } from '../../lib/calc'
import type { SetWithDate } from '../../lib/types'
import { summarizeExercise } from './ExerciseDetailPage'

const set = (performed_at: string, weight_kg: number, reps: number): SetWithDate => ({
  id: `${performed_at}-${weight_kg}`,
  workout_id: 'w',
  exercise_id: 'bench',
  set_index: 1,
  weight_kg,
  reps,
  created_at: performed_at,
  performed_at,
})

describe('summarizeExercise', () => {
  const sets = [
    set('2026-08-01T10:00:00Z', 75, 10),
    set('2026-08-08T10:00:00Z', 80, 8),
    set('2026-08-08T10:20:00Z', 80, 6),
  ]

  it('reports the personal best', () => {
    expect(summarizeExercise(sets).best).toBe(80)
  })

  it('reports the total volume', () => {
    expect(summarizeExercise(sets).volume).toBe(totalVolume(sets))
  })

  it('reports the total number of sets', () => {
    expect(summarizeExercise(sets).setCount).toBe(3)
  })

  it('builds chart points from the daily maximum', () => {
    expect(summarizeExercise(sets).points).toEqual(maxWeightByDate(sets))
  })

  it('handles an empty history', () => {
    expect(summarizeExercise([])).toEqual({
      best: personalBest([]),
      volume: 0,
      setCount: 0,
      points: [],
    })
  })
})
