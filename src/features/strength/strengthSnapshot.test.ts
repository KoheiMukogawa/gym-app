import { describe, expect, it } from 'vitest'
import {
  buildStrengthSnapshot,
  e1rmTicks,
  resolveBig3Exercises,
  type Big3ExerciseMapping,
  type StrengthExercise,
  type StrengthSet,
} from './strengthSnapshot'

const exercises: StrengthExercise[] = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
  { id: 'conventional', name: 'コンベンショナルデッドリフト', name_normalized: 'コンベンショナルデッドリフト', is_preset: false },
]
const mappings: Big3ExerciseMapping[] = [{ user_id: 'u1', lift_type: 'deadlift', exercise_id: 'conventional' }]
const now = new Date('2026-09-29T12:00:00Z')
const set = (exercise_id: string, weight_kg: number, reps = 1, performed_at = '2026-09-20T12:00:00Z'): StrengthSet =>
  ({ exercise_id, weight_kg, reps, performed_at })

describe('resolveBig3Exercises', () => {
  it('falls back independently to each exact preset when no mapping exists', () => {
    expect(resolveBig3Exercises(exercises, [])).toEqual({
      squat: exercises[0], bench: exercises[1], deadlift: exercises[2],
    })
    expect(resolveBig3Exercises(exercises, mappings)).toEqual({
      squat: exercises[0], bench: exercises[1], deadlift: exercises[3],
    })
  })

  it('uses the explicit ID even after renaming, without guessing from exercise names', () => {
    const renamed = exercises.map((exercise) => exercise.id === 'conventional'
      ? { ...exercise, name: '任意の種目', name_normalized: '任意の種目' } : exercise)
    expect(resolveBig3Exercises(renamed, mappings).deadlift?.id).toBe('conventional')
  })

  it('does not use a custom exercise as a preset or infer a variation', () => {
    expect(resolveBig3Exercises(exercises.map((exercise) => ({ ...exercise, is_preset: false })), []))
      .toEqual({ squat: null, bench: null, deadlift: null })
  })

  it('does not fall back when an explicit exercise is unavailable', () => {
    expect(resolveBig3Exercises(exercises.slice(0, 3), mappings).deadlift).toBeNull()
  })
})

describe('buildStrengthSnapshot', () => {
  const rows = [
    set('squat', 180), set('bench', 100), set('deadlift', 300),
    set('deadlift', 290, 10), // Must never leak into mapped PRs or trends.
    set('conventional', 220, 1, '2026-08-01T12:00:00Z'),
    set('conventional', 180), set('conventional', 170, 3), set('conventional', 160, 5),
    set('conventional', 150, 8), set('conventional', 140, 10),
  ]

  it('uses mapped history for every metric, trend and both totals', () => {
    const snapshot = buildStrengthSnapshot(exercises, mappings, rows, now)
    expect(snapshot.lifts.deadlift).toEqual({
      key: 'deadlift', label: 'デッドリフト', exerciseId: 'conventional', exerciseName: 'コンベンショナルデッドリフト',
      mappedExerciseId: 'conventional', pr1rm: 220, allTimeE1rm: 220, currentE1rm: 186.7,
      repPRs: { 3: 170, 5: 160, 8: 150, 10: 140 },
      e1rmPoints: [{ date: '2026-08-01', e1rm: 220 }, { date: '2026-09-20', e1rm: 186.7 }],
    })
    expect(snapshot.prTotal).toBe(500)
    expect(snapshot.currentEstimatedTotal).toBe(466.7)
  })

  it('switches or resets a mapping without mutating workout history', () => {
    const original = structuredClone(rows)
    expect(buildStrengthSnapshot(exercises, [], rows, now).prTotal).toBe(580)
    expect(buildStrengthSnapshot(exercises, mappings, rows, now).prTotal).toBe(500)
    expect(buildStrengthSnapshot(exercises, [], rows, now).prTotal).toBe(580)
    expect(rows).toEqual(original)
  })

  it('keeps a mapped exercise with no history empty even if the preset has history', () => {
    const snapshot = buildStrengthSnapshot(exercises, mappings, [set('deadlift', 300)], now)
    expect(snapshot.lifts.deadlift.exerciseId).toBe('conventional')
    expect(snapshot.lifts.deadlift.pr1rm).toBeNull()
    expect(snapshot.lifts.deadlift.allTimeE1rm).toBeNull()
    expect(snapshot.lifts.deadlift.currentE1rm).toBeNull()
    expect(snapshot.lifts.deadlift.repPRs).toEqual({ 3: null, 5: null, 8: null, 10: null })
    expect(snapshot.lifts.deadlift.e1rmPoints).toEqual([])
    expect(snapshot.prTotal).toBeNull()
    expect(snapshot.currentEstimatedTotal).toBeNull()
  })

  it('returns missing metrics for unavailable presets and explicit exercises', () => {
    const snapshot = buildStrengthSnapshot([], mappings, rows, now)
    expect(snapshot.lifts.deadlift.exerciseId).toBeNull()
    expect(snapshot.lifts.deadlift.mappedExerciseId).toBe('conventional')
    expect(snapshot.lifts.squat.pr1rm).toBeNull()
    expect(snapshot.prTotal).toBeNull()
    expect(snapshot.currentEstimatedTotal).toBeNull()
  })
})

describe('e1rmTicks', () => {
  it('pads the range by 5 kg and splits it into even steps', () => {
    expect(e1rmTicks([100.6, 110])).toEqual([95, 100, 105, 110, 115])
    expect(e1rmTicks([180, 260])).toEqual([175, 200, 225, 250, 275])
  })
  it('still gives a range when every point is the same', () => {
    expect(e1rmTicks([60, 60])).toEqual([55, 60, 65])
  })
})
