import { supabase } from '../../lib/supabase'
import {
  buildStrengthSnapshot,
  type Big3ExerciseMapping,
  type LiftKey,
  type StrengthExercise,
  type StrengthSet,
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

type Big3Data = {
  exercises: StrengthExercise[]
  mappings: Big3ExerciseMapping[]
  sets: StrengthSet[]
}

// Keep the existing caller signature; the RPC derives ownership from auth.uid(),
// never from a caller-supplied user ID. Aggregation remains in TypeScript.
export async function fetchStrengthSnapshot(_userId: string): Promise<StrengthSnapshot> {
  const { data, error } = await supabase.rpc('my_big3_data')
  if (error) throw error
  const result = data as Big3Data | null
  if (!result || !Array.isArray(result.exercises) || !Array.isArray(result.mappings) || !Array.isArray(result.sets)) {
    throw new Error('BIG3の記録を取得できませんでした')
  }
  return buildStrengthSnapshot(result.exercises, result.mappings, result.sets)
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
