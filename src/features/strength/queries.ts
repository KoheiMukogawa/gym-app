import { supabase } from '../../lib/supabase'
import { fetchExercises } from '../exercises/queries'
import {
  buildStrengthSnapshot,
  resolveBig3Exercises,
  type Big3ExerciseMapping,
  type LiftKey,
  type StrengthSnapshot,
} from './strengthSnapshot'

export type { LiftSnapshot, StrengthSnapshot } from './strengthSnapshot'

export async function fetchBig3ExerciseMappings(userId: string): Promise<Big3ExerciseMapping[]> {
  const { data, error } = await supabase
    .from('big3_exercise_mappings')
    .select('user_id, lift_type, exercise_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as Big3ExerciseMapping[]
}

/** null removes the explicit mapping and restores the preset fallback. */
export async function saveBig3ExerciseMapping(
  userId: string,
  liftType: LiftKey,
  exerciseId: string | null,
): Promise<void> {
  const { error } = exerciseId === null
    ? await supabase.from('big3_exercise_mappings').delete()
      .eq('user_id', userId).eq('lift_type', liftType)
    : await supabase.from('big3_exercise_mappings').upsert({
      user_id: userId,
      lift_type: liftType,
      exercise_id: exerciseId,
    }, { onConflict: 'user_id,lift_type' })
  if (error) throw error
}

type StrengthSetRow = {
  exercise_id: string
  weight_kg: number
  reps: number
  workouts: { performed_at: string }
}

export async function fetchStrengthSnapshot(userId: string): Promise<StrengthSnapshot> {
  const [exercises, mappings] = await Promise.all([
    fetchExercises(),
    fetchBig3ExerciseMappings(userId),
  ])
  const resolved = resolveBig3Exercises(exercises, mappings)
  const exerciseIds = [...new Set(Object.values(resolved)
    .flatMap((exercise) => exercise ? [exercise.id] : []))]
  const rows: StrengthSetRow[] = []

  // Fetch the complete history, including PRs beyond PostgREST's first page.
  if (exerciseIds.length > 0) {
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, workouts!inner(user_id, performed_at)')
        .in('exercise_id', exerciseIds)
        .eq('workouts.user_id', userId)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const page = (data ?? []) as unknown as StrengthSetRow[]
      rows.push(...page)
      if (page.length < pageSize) break
    }
  }

  return buildStrengthSnapshot(exercises, mappings, rows.map((row) => ({
    exercise_id: row.exercise_id,
    weight_kg: row.weight_kg,
    reps: row.reps,
    performed_at: row.workouts.performed_at,
  })))
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
