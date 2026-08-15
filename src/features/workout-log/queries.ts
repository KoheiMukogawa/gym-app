import { supabase } from '../../lib/supabase'
import type { Workout, WorkoutSet } from '../../lib/types'
import type { LoggedSet } from './logReducer'

export async function createWorkout(userId: string): Promise<Workout> {
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
  })
  if (error) {
    // id は画面側が生成したもの。主キー重複（23505）は「直前の試行は
    // ネットワーク的に失敗して見えたが実際にはコミットされていた」ことを
    // 意味するので、再試行を安全にべき等にするためここは成功として扱う。
    if (error.code === '23505') return
    throw error
  }
}

/** セット本体を削除する。取り消し（undo）が保存済みのセットに対して行われたときに使う。 */
export async function deleteSet(setId: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', setId)
  if (error) throw error
}

/** セットが1件も保存されなかったワークアウトを消す。空の記録をフィードに残さないため。 */
export async function deleteWorkoutIfEmpty(workoutId: string): Promise<void> {
  const { count, error } = await supabase
    .from('workout_sets')
    .select('id', { count: 'exact', head: true })
    .eq('workout_id', workoutId)
  if (error) throw error
  // 件数が取得できない（null）場合、中身があるかどうか分からない。
  // 分からないときに削除してしまうと、実際にはセットが入っているワークアウトを
  // 消しかねないので、何もしない。
  if (count === null) return
  if (count === 0) {
    const { error: deleteError } = await supabase.from('workouts').delete().eq('id', workoutId)
    if (deleteError) {
      console.error(`空ワークアウトの削除に失敗しました (workout: ${workoutId})`, deleteError)
      throw deleteError
    }
  }
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
