import { supabase } from '../../lib/supabase'
import type { Profile } from '../../lib/types'
import { WORKOUT_SELECT, mapWorkoutRows, type FeedItem, type WorkoutRow } from '../feed/queries'

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true })
  if (error) throw error

  return (data ?? []) as Profile[]
}

export async function fetchUserWorkouts(userId: string, limit = 60): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .eq('user_id', userId)
    .order('performed_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return mapWorkoutRows((data ?? []) as unknown as WorkoutRow[])
}
