import { supabase } from '../../lib/supabase'

export type UsageWeek = { week_start: string; active_users: number; workouts: number; sets: number; signups: number }
export type UsageStats = { total_users: number; active_7d: number; active_30d: number; weeks: UsageWeek[] }

/** 管理者向けの集計値。週は古い順の12件。 */
export async function fetchUsageStats(): Promise<UsageStats> {
  const { data, error } = await supabase.rpc('admin_usage_stats')
  if (error) throw error
  return data as UsageStats
}

/** 週の開始日（YYYY-MM-DD）を「10/5」の形にする。 */
export function formatWeek(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}
