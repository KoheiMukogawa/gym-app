import { supabase } from '../../lib/supabase'
import { localDate, validateSet, workoutDateISO } from '../../lib/dates'
import type { Workout, WorkoutSet } from '../../lib/types'

export type EditableWorkout = Workout & { workout_sets: WorkoutSet[] }

export async function fetchEditableWorkout(userId: string, id: string): Promise<EditableWorkout | null> {
  const { data, error } = await supabase.from('workouts').select('*, workout_sets(*)')
    .eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as EditableWorkout | null
}

// A client-generated ID makes a retry safe if the first response was lost.
export async function createDatedWorkout(userId: string, id: string, date: string): Promise<void> {
  const { error } = await supabase.from('workouts').insert({
    id, user_id: userId, performed_at: workoutDateISO(date),
  })
  if (error?.code === '23505') {
    const existing = await fetchEditableWorkout(userId, id)
    if (!existing) throw error
    if (localDate(existing.performed_at) !== date) {
      await updateWorkoutDate(userId, id, date, existing.performed_at)
    }
  } else if (error) throw error
}

export async function updateWorkoutDate(userId: string, id: string, date: string, original: string): Promise<string> {
  const performed_at = workoutDateISO(date, original)
  const { error } = await supabase.from('workouts').update({ performed_at })
    .eq('id', id).eq('user_id', userId).select('id').single()
  if (error) throw error
  return performed_at
}

export async function updateWorkoutSet(workoutId: string, set: Pick<WorkoutSet, 'id' | 'exercise_id' | 'weight_kg' | 'reps' | 'set_index'>): Promise<void> {
  validateSet(set.weight_kg, set.reps)
  const { id, exercise_id, weight_kg, reps, set_index } = set
  const values = { exercise_id, weight_kg, reps, set_index }
  const { error } = await supabase.from('workout_sets').update(values)
    .eq('id', id).eq('workout_id', workoutId).select('id').single()
  if (error) throw error
}

export async function saveEditableSet(workoutId: string, set: Pick<WorkoutSet, 'id' | 'exercise_id' | 'weight_kg' | 'reps' | 'set_index'>): Promise<void> {
  validateSet(set.weight_kg, set.reps)
  const { id, exercise_id, weight_kg, reps, set_index } = set
  // A lost response may be retried after the user corrects the input. Upsert
  // the same ID so the database receives the corrected values as well.
  const { error } = await supabase.from('workout_sets').upsert({
    id, workout_id: workoutId, exercise_id, weight_kg, reps, set_index,
  }, { onConflict: 'id' }).select('id').single()
  if (error) throw error
}

export async function removeWorkoutSet(workoutId: string, id: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', id).eq('workout_id', workoutId)
  if (error) throw error
}

export async function removeWorkout(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}
