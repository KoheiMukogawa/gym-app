import { supabase } from '../../lib/supabase'
import { localDate } from '../../lib/dates'
import type { BodyweightLog } from '../../lib/bodyweight'

/** 本人だけが読める体重の記録（古い順）。 */
export async function fetchBodyweightLogs(userId: string): Promise<BodyweightLog[]> {
  const rows: BodyweightLog[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('bodyweight_logs').select('recorded_on, bodyweight_kg, body_fat_pct')
      .eq('user_id', userId).order('recorded_on', { ascending: true }).range(offset, offset + pageSize - 1)
    if (error) throw error
    const page = (data ?? []) as BodyweightLog[]
    rows.push(...page.map((l) => ({
      recorded_on: l.recorded_on,
      bodyweight_kg: Number(l.bodyweight_kg),
      body_fat_pct: l.body_fat_pct == null ? null : Number(l.body_fat_pct),
    })))
    if (page.length < pageSize) return rows
  }
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

/** 体重と体脂肪率をまとめて記録する。同じ日に入れ直した場合は上書きする。 */
export async function saveBodyComposition(
  userId: string,
  input: { date?: string; bodyweightKg: number; bodyFatPct: number | null },
): Promise<BodyweightLog> {
  const row = {
    recorded_on: input.date ?? localDate(),
    bodyweight_kg: Math.round(input.bodyweightKg * 10) / 10,
    body_fat_pct: input.bodyFatPct === null ? null : Math.round(input.bodyFatPct * 10) / 10,
  }
  const { error } = await supabase.from('bodyweight_logs').upsert({ user_id: userId, ...row }, { onConflict: 'user_id,recorded_on' })
  if (error) throw error
  return row
}

/** その日の記録を消す。 */
export async function deleteBodyLog(userId: string, recordedOn: string): Promise<void> {
  const { error } = await supabase.from('bodyweight_logs').delete().eq('user_id', userId).eq('recorded_on', recordedOn)
  if (error) throw error
}
