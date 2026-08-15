import { supabase } from '../../lib/supabase'

export type FeedItem = {
  workout_id: string
  user_id: string
  display_name: string
  performed_at: string
  sets: { exercise_id: string; exercise_name: string; weight_kg: number; reps: number }[]
}

export type WorkoutRow = {
  id: string
  user_id: string
  performed_at: string
  profiles: { display_name: string } | null
  workout_sets: {
    exercise_id: string
    weight_kg: number
    reps: number
    set_index: number
    exercises: { name: string } | null
  }[]
}

// fetchFeed（全員分）と fetchUserWorkouts（本人分、history/queries.ts）は select する
// 列と行の整形ロジックが完全に同一で、絞り込み条件（user_id）だけが異なる。
// 二重にメンテするとどちらかだけ直して食い違う恐れがあるため、ここで共有する。
export const WORKOUT_SELECT = `
  id, user_id, performed_at,
  profiles ( display_name ),
  workout_sets ( exercise_id, weight_kg, reps, set_index, exercises ( name ) )
`

export function mapWorkoutRows(rows: WorkoutRow[]): FeedItem[] {
  return rows
    .filter((w) => w.workout_sets.length > 0)
    .map((w) => ({
      workout_id: w.id,
      user_id: w.user_id,
      display_name: w.profiles?.display_name ?? 'メンバー',
      performed_at: w.performed_at,
      sets: [...w.workout_sets]
        .sort((a, b) => a.set_index - b.set_index)
        .map((s) => ({
          exercise_id: s.exercise_id,
          exercise_name: s.exercises?.name ?? '種目',
          weight_kg: s.weight_kg,
          reps: s.reps,
        })),
    }))
}

export async function fetchFeed(limit = 30): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .order('performed_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return mapWorkoutRows((data ?? []) as unknown as WorkoutRow[])
}
