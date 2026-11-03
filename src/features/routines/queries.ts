import { supabase } from '../../lib/supabase'
import { InputError } from '../../lib/errors'
import { isArray, readCache, writeCache } from '../../lib/localCache'

export type Routine = { id: string; user_id: string; name: string; exercise_ids: string[]; created_at?: string }
export type ActiveRoutine = { name: string; exerciseIds: string[]; index: number }

export async function fetchRoutines(userId: string): Promise<Routine[]> {
  const { data, error } = await supabase.from('training_routines').select('*').eq('user_id', userId).order('created_at')
  if (error) throw error
  const routines = (data ?? []) as Routine[]
  writeCache(userId, 'routines', routines)
  return routines
}
/** 前回読み込んだルーティン。記録画面をすぐに出すために使い、そのあと読み直す */
export function cachedRoutines(userId: string | null): Routine[] | undefined {
  return readCache<Routine[]>(userId, 'routines', isArray)
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
  const order: string[] = data?.exercise_order ?? []
  writeCache(userId, 'exercise-order', order)
  return order
}
/** 前回読み込んだ種目の並び順 */
export function cachedExerciseOrder(userId: string | null): string[] | undefined {
  return readCache<string[]>(userId, 'exercise-order', isArray)
}
export async function saveExerciseOrder(userId: string, order: string[]): Promise<void> {
  const unique = [...new Set(order)]
  await savePreference(userId, { exercise_order: unique })
  writeCache(userId, 'exercise-order', unique)
}

export type ExerciseVisibility = { addedIds: string[]; hiddenIds: string[] }

export async function fetchExerciseVisibility(userId: string): Promise<ExerciseVisibility> {
  const { data, error } = await supabase.from('exercise_preferences')
    .select('added_exercise_ids, hidden_exercise_ids').eq('user_id', userId).maybeSingle()
  if (error) throw error
  const visibility: ExerciseVisibility = { addedIds: data?.added_exercise_ids ?? [], hiddenIds: data?.hidden_exercise_ids ?? [] }
  writeCache(userId, 'exercise-visibility', visibility)
  return visibility
}
/** 前回読み込んだ種目の表示・非表示 */
export function cachedExerciseVisibility(userId: string | null): ExerciseVisibility | undefined {
  return readCache(userId, 'exercise-visibility', (value): value is ExerciseVisibility =>
    Array.isArray((value as ExerciseVisibility | null)?.addedIds) && Array.isArray((value as ExerciseVisibility).hiddenIds))
}

export async function saveExerciseVisibility(userId: string, visibility: ExerciseVisibility): Promise<void> {
  const saved = { addedIds: [...new Set(visibility.addedIds)], hiddenIds: [...new Set(visibility.hiddenIds)] }
  await savePreference(userId, { added_exercise_ids: saved.addedIds, hidden_exercise_ids: saved.hiddenIds })
  writeCache(userId, 'exercise-visibility', saved)
}

// Update only the changed fields so reordering cannot reset visibility (or vice versa).
async function savePreference(userId: string, fields: Record<string, string[]>): Promise<void> {
  const update = () => supabase.from('exercise_preferences').update(fields)
    .eq('user_id', userId).select('user_id').maybeSingle()
  const first = await update()
  if (first.error) throw first.error
  if (first.data) return
  const inserted = await supabase.from('exercise_preferences').insert({ user_id: userId, ...fields })
  if (!inserted.error) return
  if (inserted.error.code !== '23505') throw inserted.error
  const retry = await update()
  if (retry.error) throw retry.error
  if (!retry.data) throw inserted.error
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
