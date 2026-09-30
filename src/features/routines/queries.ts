import { supabase } from '../../lib/supabase'
import { InputError } from '../../lib/errors'

export type Routine = { id: string; user_id: string; name: string; exercise_ids: string[]; created_at?: string }
export type ActiveRoutine = { name: string; exerciseIds: string[]; index: number }

export async function fetchRoutines(userId: string): Promise<Routine[]> {
  const { data, error } = await supabase.from('training_routines').select('*').eq('user_id', userId).order('created_at')
  if (error) throw error
  return (data ?? []) as Routine[]
}
export async function saveRoutine(routine: Routine): Promise<Routine> {
  if (!routine.name.trim() || routine.name.trim().length > 40 || routine.exercise_ids.length < 1 ||
      routine.exercise_ids.length > 30 || new Set(routine.exercise_ids).size !== routine.exercise_ids.length) {
    throw new InputError('ルーティン名と、1〜30種目を重複なく登録してください')
  }
  const { data, error } = await supabase.from('training_routines').upsert({
    id: routine.id, user_id: routine.user_id, name: routine.name.trim(), exercise_ids: routine.exercise_ids,
  }, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data as Routine
}
export async function deleteRoutine(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('training_routines').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}
export async function fetchExerciseOrder(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('exercise_preferences').select('exercise_order').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.exercise_order ?? []
}
export async function saveExerciseOrder(userId: string, order: string[]): Promise<void> {
  const { error } = await supabase.from('exercise_preferences').upsert({
    user_id: userId, exercise_order: [...new Set(order)],
  }, { onConflict: 'user_id' }).select('user_id').single()
  if (error) throw error
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
