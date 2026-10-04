import {
  bestEstimatedOneRepMax,
  bestSingle,
  currentEstimatedOneRepMax,
  estimatedOneRepMaxByDate,
  repPersonalBest,
  strengthTotal,
  type DatedStrengthSet,
} from '../../lib/strength'
import type { Exercise } from '../../lib/types'

export const LIFT_KEYS = ['squat', 'bench', 'deadlift'] as const
export type LiftKey = typeof LIFT_KEYS[number]

export const LIFT_LABELS: Record<LiftKey, string> = {
  squat: 'スクワット',
  bench: 'ベンチプレス',
  deadlift: 'デッドリフト',
}

export type Big3ExerciseMapping = {
  user_id: string
  lift_type: LiftKey
  exercise_id: string
}

export type StrengthExercise = Pick<Exercise, 'id' | 'name' | 'name_normalized' | 'is_preset'>
export type StrengthSet = DatedStrengthSet & { exercise_id: string }

export type LiftSnapshot = {
  key: LiftKey
  label: string
  exerciseId: string | null
  exerciseName: string | null
  // Preserve explicit selections even if the exercise is unavailable.
  mappedExerciseId: string | null
  pr1rm: number | null
  allTimeE1rm: number | null
  currentE1rm: number | null
  repPRs: Record<3 | 5 | 8 | 10, number | null>
  e1rmPoints: { date: string; e1rm: number }[]
}

export type StrengthSnapshot = {
  lifts: Record<LiftKey, LiftSnapshot>
  prTotal: number | null
  currentEstimatedTotal: number | null
}

/** Resolve one user's mappings. Only absent mappings use exact preset defaults. */
export function resolveBig3Exercises(
  exercises: StrengthExercise[],
  mappings: Big3ExerciseMapping[],
): Record<LiftKey, StrengthExercise | null> {
  function resolve(key: LiftKey) {
    const mapping = mappings.find((row) => row.lift_type === key)
    return (mapping
      ? exercises.find((row) => row.id === mapping.exercise_id)
      : exercises.find((row) => row.is_preset && row.name_normalized === LIFT_LABELS[key])) ?? null
  }
  return { squat: resolve('squat'), bench: resolve('bench'), deadlift: resolve('deadlift') }
}

export function buildStrengthSnapshot(
  exercises: StrengthExercise[],
  mappings: Big3ExerciseMapping[],
  rows: StrengthSet[],
  now = new Date(),
): StrengthSnapshot {
  const resolved = resolveBig3Exercises(exercises, mappings)
  function buildLift(key: LiftKey): LiftSnapshot {
    const exercise = resolved[key]
    const sets = exercise ? rows.filter((row) => row.exercise_id === exercise.id) : []
    return {
      key,
      label: LIFT_LABELS[key],
      exerciseId: exercise?.id ?? null,
      exerciseName: exercise?.name ?? null,
      mappedExerciseId: mappings.find((row) => row.lift_type === key)?.exercise_id ?? null,
      pr1rm: bestSingle(sets),
      allTimeE1rm: bestEstimatedOneRepMax(sets),
      currentE1rm: currentEstimatedOneRepMax(sets, now),
      repPRs: {
        3: repPersonalBest(sets, 3),
        5: repPersonalBest(sets, 5),
        8: repPersonalBest(sets, 8),
        10: repPersonalBest(sets, 10),
      },
      e1rmPoints: estimatedOneRepMaxByDate(sets),
    }
  }
  const lifts = { squat: buildLift('squat'), bench: buildLift('bench'), deadlift: buildLift('deadlift') }
  return {
    lifts,
    prTotal: strengthTotal(LIFT_KEYS.map((key) => lifts[key].pr1rm)),
    currentEstimatedTotal: strengthTotal(LIFT_KEYS.map((key) => lifts[key].currentE1rm)),
  }
}

// At least 5 kg of headroom on each side, split into at most 4 even steps.
export function e1rmTicks(values: number[]): number[] {
  const min = Math.min(...values) - 5, max = Math.max(...values) + 5
  const step = [5, 10, 20, 25, 50, 100, 200].find((size) => Math.ceil(max / size) - Math.floor(min / size) <= 4) ?? 500
  const low = Math.floor(min / step) * step, count = Math.ceil(max / step) - Math.floor(min / step)
  return Array.from({ length: count + 1 }, (_, i) => low + i * step)
}
