import { supabase } from '../../lib/supabase'
import { localDate } from '../../lib/dates'
import type { BodyweightLog } from '../../lib/bodyweight'

/** 本人だけが読める体重の記録（古い順）。 */
export async function fetchBodyweightLogs(userId: string): Promise<BodyweightLog[]> {
  const { data, error } = await supabase.from('bodyweight_logs').select('recorded_on, bodyweight_kg')
    .eq('user_id', userId).order('recorded_on', { ascending: true })
  if (error) throw error
  return ((data ?? []) as BodyweightLog[]).map((l) => ({ recorded_on: l.recorded_on, bodyweight_kg: Number(l.bodyweight_kg) }))
}

/** 今日の体重を記録する。同じ日に入れ直した場合は上書きする。 */
export async function saveBodyweight(userId: string, bodyweightKg: number): Promise<BodyweightLog> {
  const log = { recorded_on: localDate(), bodyweight_kg: Math.round(bodyweightKg * 10) / 10 }
  const { error } = await supabase.from('bodyweight_logs').upsert({ user_id: userId, ...log }, { onConflict: 'user_id,recorded_on' })
  if (error) throw error
  return log
}

/** 体重の入力値を検証して数値にする。 */
export function parseBodyweight(value: string): number | null {
  const n = Number(value)
  return value.trim() && Number.isFinite(n) && n >= 20 && n <= 300 ? n : null
}
