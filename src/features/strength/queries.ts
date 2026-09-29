import { supabase } from '../../lib/supabase'
import {
  bestEstimatedOneRepMax,
  bestSingle,
  currentEstimatedOneRepMax,
  strengthTotal,
  type DatedStrengthSet,
} from '../../lib/strength'

export type LiftKey = 'squat' | 'bench' | 'deadlift'

const LIFT_DEFS: Record<LiftKey, { label: string; normalizedName: string }> = {
  squat: { label: 'スクワット', normalizedName: 'スクワット' },
  bench: { label: 'ベンチプレス', normalizedName: 'ベンチプレス' },
  deadlift: { label: 'デッドリフト', normalizedName: 'デッドリフト' },
}

export type LiftSnapshot = {
  key: LiftKey
  label: string
  exerciseId: string | null
  pr1rm: number | null
  allTimeE1rm: number | null
  currentE1rm: number | null
}

export type StrengthSnapshot = {
  lifts: Record<LiftKey, LiftSnapshot>
  prTotal: number | null
  currentEstimatedTotal: number | null
}

type ExerciseRow = {
  id: string
  name_normalized: string
}

type StrengthSetRow = {
  exercise_id: string
  weight_kg: number
  reps: number
  workouts: { performed_at: string }
}

function emptyLift(key: LiftKey): LiftSnapshot {
  return {
    key,
    label: LIFT_DEFS[key].label,
    exerciseId: null,
    pr1rm: null,
    allTimeE1rm: null,
    currentE1rm: null,
  }
}

export async function fetchStrengthSnapshot(userId: string): Promise<StrengthSnapshot> {
  const liftKeys = Object.keys(LIFT_DEFS) as LiftKey[]
  const normalizedNames = liftKeys.map((key) => LIFT_DEFS[key].normalizedName)

  const { data: exerciseData, error: exerciseError } = await supabase
    .from('exercises')
    .select('id, name_normalized')
    .in('name_normalized', normalizedNames)

  if (exerciseError) throw exerciseError

  const exercises = (exerciseData ?? []) as ExerciseRow[]
  const exerciseByLift = new Map<LiftKey, ExerciseRow>()

  for (const key of liftKeys) {
    const exercise = exercises.find((row) => row.name_normalized === LIFT_DEFS[key].normalizedName)
    if (exercise) exerciseByLift.set(key, exercise)
  }

  const exerciseIds = exercises.map((row) => row.id)
  let rows: StrengthSetRow[] = []

  if (exerciseIds.length > 0) {
    const { data: setData, error: setError } = await supabase
      .from('workout_sets')
      .select('exercise_id, weight_kg, reps, workouts!inner(user_id, performed_at)')
      .in('exercise_id', exerciseIds)
      .eq('workouts.user_id', userId)

    if (setError) throw setError
    rows = (setData ?? []) as unknown as StrengthSetRow[]
  }

  const lifts = {
    squat: emptyLift('squat'),
    bench: emptyLift('bench'),
    deadlift: emptyLift('deadlift'),
  } satisfies Record<LiftKey, LiftSnapshot>

  for (const key of liftKeys) {
    const exercise = exerciseByLift.get(key)
    if (!exercise) continue

    const sets: DatedStrengthSet[] = rows
      .filter((row) => row.exercise_id === exercise.id)
      .map((row) => ({
        weight_kg: row.weight_kg,
        reps: row.reps,
        performed_at: row.workouts.performed_at,
      }))

    lifts[key] = {
      key,
      label: LIFT_DEFS[key].label,
      exerciseId: exercise.id,
      pr1rm: bestSingle(sets),
      allTimeE1rm: bestEstimatedOneRepMax(sets),
      currentE1rm: currentEstimatedOneRepMax(sets),
    }
  }

  return {
    lifts,
    prTotal: strengthTotal(liftKeys.map((key) => lifts[key].pr1rm)),
    currentEstimatedTotal: strengthTotal(liftKeys.map((key) => lifts[key].currentE1rm)),
  }
}

export type StrengthGoal = {
  id: string
  user_id: string
  label: string
  target_date: string
  target_total_kg: number
  created_at: string
}

export async function fetchStrengthGoals(userId: string): Promise<StrengthGoal[]> {
  const { data, error } = await supabase
    .from('strength_goals')
    .select('*')
    .eq('user_id', userId)
    .order('target_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as StrengthGoal[]
}

export async function createStrengthGoal(input: {
  userId: string
  label: string
  targetDate: string
  targetTotalKg: number
}): Promise<StrengthGoal> {
  const { data, error } = await supabase
    .from('strength_goals')
    .insert({
      user_id: input.userId,
      label: input.label.trim(),
      target_date: input.targetDate,
      target_total_kg: input.targetTotalKg,
    })
    .select()
    .single()

  if (error) throw error
  return data as StrengthGoal
}

export async function deleteStrengthGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('strength_goals').delete().eq('id', goalId)
  if (error) throw error
}
