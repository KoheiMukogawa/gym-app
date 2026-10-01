import { supabase } from '../../lib/supabase'
import type { Profile } from '../../lib/types'
import { WORKOUT_SELECT, mapWorkoutRows, type FeedItem, type WorkoutRow } from '../feed/queries'

export async function fetchMonthWorkouts(userId: string, year: number, month: number): Promise<FeedItem[]> {
  const start = new Date(year, month - 1, 1).toISOString()
  const end = new Date(year, month, 1).toISOString()
  const rows: WorkoutRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('workouts').select(WORKOUT_SELECT)
      .eq('user_id', userId).gte('performed_at', start).lt('performed_at', end)
      .order('performed_at', { ascending: false }).order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...((data ?? []) as unknown as WorkoutRow[]))
    if (!data || data.length < 500) break
  }
  return mapWorkoutRows(rows, true)
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true })
  if (error) throw error

  return (data ?? []) as Profile[]
}

export async function fetchUserWorkouts(userId: string, limit = 60, offset = 0): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .eq('user_id', userId)
    .order('performed_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error

  return mapWorkoutRows((data ?? []) as unknown as WorkoutRow[], true)
}
