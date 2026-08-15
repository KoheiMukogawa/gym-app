import { supabase } from '../../lib/supabase'
import { normalizeExerciseName } from '../../lib/calc'
import type { Exercise, MuscleGroup, SetWithDate } from '../../lib/types'

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data as Exercise[]
}

export async function createExercise(input: {
  name: string
  muscle_group: MuscleGroup
  userId: string
}): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: input.name.trim(),
      name_normalized: normalizeExerciseName(input.name),
      muscle_group: input.muscle_group,
      is_preset: false,
      created_by: input.userId,
    })
    .select()
    .single()
  if (error) throw error
  return data as Exercise
}

/** 直近に使った種目IDを新しい順・重複なしで返す。種目選択の並べ替えに使う。 */
export async function fetchRecentExerciseIds(userId: string, limit = 8): Promise<string[]> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('exercise_id, created_at, workouts!inner(user_id)')
    .eq('workouts.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error

  const seen: string[] = []
  for (const row of (data ?? []) as { exercise_id: string }[]) {
    if (!seen.includes(row.exercise_id)) seen.push(row.exercise_id)
    if (seen.length >= limit) break
  }
  return seen
}

export async function fetchExercise(exerciseId: string): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .single()
  if (error) throw error
  return data as Exercise
}

/** ある種目における、そのユーザーの全セットを古い順で返す。 */
export async function fetchExerciseSets(
  exerciseId: string,
  userId: string,
): Promise<SetWithDate[]> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('*, workouts!inner(user_id, performed_at)')
    .eq('exercise_id', exerciseId)
    .eq('workouts.user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error

  type Row = SetWithDate & { workouts: { performed_at: string } }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    workout_id: r.workout_id,
    exercise_id: r.exercise_id,
    set_index: r.set_index,
    weight_kg: r.weight_kg,
    reps: r.reps,
    created_at: r.created_at,
    performed_at: r.workouts.performed_at,
  }))
}
