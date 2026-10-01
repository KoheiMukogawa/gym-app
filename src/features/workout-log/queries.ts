import { supabase } from '../../lib/supabase'
import type { Workout, WorkoutSet } from '../../lib/types'
import type { LoggedSet } from './logReducer'

function todayRange(): [string, string] {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return [start.toISOString(), end.toISOString()]
}

/** 今日（端末の暦日）のワークアウトと、その中のセットを返す。1日1件の記録にまとめるため。 */
export async function fetchTodayWorkout(userId: string): Promise<{ id: string; sets: LoggedSet[] } | null> {
  const [start, end] = todayRange()
  const { data, error } = await supabase
    .from('workouts')
    .select('id, workout_sets(id, exercise_id, set_index, weight_kg, reps, note, created_at)')
    .eq('user_id', userId)
    .gte('performed_at', start)
    .lt('performed_at', end)
    .order('performed_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as { id: string; workout_sets: (LoggedSet & { created_at: string })[] | null }
  const sets = [...(row.workout_sets ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ id, exercise_id, set_index, weight_kg, reps, note }) => ({ id, exercise_id, set_index, weight_kg: Number(weight_kg), reps, ...(note ? { note } : {}) }))
  return { id: row.id, sets }
}

/** 今日のワークアウトがあればそれを使い、なければ作る。同じ日のセットを1件の記録にまとめる。 */
export async function createWorkout(userId: string): Promise<Workout> {
  const [start, end] = todayRange()
  const { data: existing, error: findError } = await supabase
    .from('workouts')
    .select()
    .eq('user_id', userId)
    .gte('performed_at', start)
    .lt('performed_at', end)
    .order('performed_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing as Workout
  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data as Workout
}

export async function saveSet(workoutId: string, set: LoggedSet): Promise<void> {
  const { error } = await supabase.from('workout_sets').insert({
    id: set.id,
    workout_id: workoutId,
    exercise_id: set.exercise_id,
    set_index: set.set_index,
    weight_kg: set.weight_kg,
    reps: set.reps,
    note: set.note ?? null,
  })
  if (error) {
    // id は画面側が生成したもの。主キー重複（23505）は「直前の試行は
    // ネットワーク的に失敗して見えたが実際にはコミットされていた」ことを
    // 意味するので、再試行を安全にべき等にするためここは成功として扱う。
    if (error.code === '23505') return
    throw error
  }
}

/** セットのメモを保存する（空文字はメモなしとして保存）。 */
export async function updateSetNote(setId: string, note: string): Promise<void> {
  const value = note.trim() ? note.trim().slice(0, 200) : null
  const { error } = await supabase.from('workout_sets').update({ note: value }).eq('id', setId).select('id').single()
  if (error) throw error
}

/** セット本体を削除する。取り消し（undo）が保存済みのセットに対して行われたときに使う。 */
export async function deleteSet(setId: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', setId)
  if (error) throw error
}

/**
 * セットが1件も保存されなかったワークアウトを消す。空の記録をフィードに残さないため。
 * 実際に削除したかどうかを呼び出し側に返す。呼び出し側（LogPage）はこれを使って、
 * 削除が起きたときだけ「ワークアウトはもう存在しない」前提の状態（workoutId など）を
 * リセットする。削除しなかった（中身があった）のに呼び出し側がリセットしてしまうと、
 * 次のセットが別の新しいワークアウトに分裂して保存されてしまう。
 */
export async function deleteWorkoutIfEmpty(workoutId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('workout_sets')
    .select('id', { count: 'exact', head: true })
    .eq('workout_id', workoutId)
  if (error) throw error
  // 件数が取得できない（null）場合、中身があるかどうか分からない。
  // 分からないときに削除してしまうと、実際にはセットが入っているワークアウトを
  // 消しかねないので、何もしない。
  if (count === null) return false
  if (count === 0) {
    const { error: deleteError } = await supabase.from('workouts').delete().eq('id', workoutId)
    if (deleteError) {
      console.error(`空ワークアウトの削除に失敗しました (workout: ${workoutId})`, deleteError)
      throw deleteError
    }
    return true
  }
  return false
}

/** 前回値プリフィル用に、そのユーザーのセット履歴を新しい順で返す。 */
export async function fetchUserSetHistory(
  userId: string,
  limit = 300,
): Promise<Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[]> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('exercise_id, weight_kg, reps, created_at, workouts!inner(user_id)')
    .eq('workouts.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[]
}
