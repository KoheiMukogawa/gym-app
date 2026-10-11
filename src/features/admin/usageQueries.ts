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

export type Retention = { eligible: number; retained: number }
export type GrowthStats = {
  weekly_active_lifters: number
  lifters_2plus_days_7d: number
  workouts_7d: number
  sets_7d: number
  retention: { d1: Retention; d7: Retention; d30: Retention }
  signups_by_source_90d: { source: string; signups: number }[]
}

/** 成長の指標（Weekly Active Lifters・リテンション・登録の入口）。集計値だけ。 */
export async function fetchGrowthStats(): Promise<GrowthStats> {
  const { data, error } = await supabase.rpc('admin_growth_stats')
  if (error) throw error
  return data as GrowthStats
}

/** 「2/4人（50%）」。対象者がいなければ「—」。 */
export function formatRate({ eligible, retained }: Retention): string {
  if (eligible === 0) return '—'
  return `${retained}/${eligible}人（${Math.round((retained / eligible) * 100)}%）`
}

/** 1人あたり（小数1桁）。分母が0なら「—」。 */
export function perPerson(total: number, people: number): string {
  return people === 0 ? '—' : (total / people).toFixed(1)
}
