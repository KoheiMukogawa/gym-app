import { supabase } from '../../lib/supabase'
import { normalizeExerciseName } from '../../lib/calc'
import type { Exercise, MuscleGroup } from '../../lib/types'

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
