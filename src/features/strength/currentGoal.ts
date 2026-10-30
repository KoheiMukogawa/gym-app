import { supabase } from '../../lib/supabase'
import { InputError } from '../../lib/errors'
import type { StrengthGoal } from './queries'

// Keep old goals intact, but expose one stable goal regardless of progress.
export function currentGoal(goals: StrengthGoal[]): StrengthGoal | null {
  return [...goals].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] ?? null
}

export type LiftTargets = { squat: number | null; bench: number | null; deadlift: number | null }

function validWeight(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 9999.9 && Math.abs(value * 10 - Math.round(value * 10)) <= 1e-7
}

export async function saveCurrentGoal(input: {
  userId: string; existing: StrengthGoal | null; targetDate: string; targetTotalKg: number
  /** 種目別の目標（任意）。null は設定しない */
  liftTargets?: LiftTargets
}): Promise<StrengthGoal> {
  const { userId, existing, targetDate, targetTotalKg } = input
  const lifts = input.liftTargets ?? { squat: null, bench: null, deadlift: null }
  const date = new Date(targetDate + 'T12:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== targetDate || !Number.isFinite(targetTotalKg) ||
      targetTotalKg <= 0 || targetTotalKg > 9999.9 ||
      Math.abs(targetTotalKg * 10 - Math.round(targetTotalKg * 10)) > 1e-7) {
    throw new InputError('目標重量（0より大きく9999.9kg以下、小数1桁まで）と期限を入力してください')
  }
  if (Object.values(lifts).some((value) => value !== null && !validWeight(value))) {
    throw new InputError('種目別の目標は0より大きく9999.9kg以下、小数1桁までで入力してください（空欄なら設定しません）')
  }
  // Reuse the goal ID for edits. A deterministic first ID also makes retries
  // and simultaneous first saves from two devices update the same record.
  const { data, error } = await supabase.from('strength_goals').upsert({
    id: existing?.id ?? userId, user_id: userId, label: existing?.label ?? 'Big3目標',
    target_date: targetDate, target_total_kg: targetTotalKg,
    target_squat_kg: lifts.squat, target_bench_kg: lifts.bench, target_deadlift_kg: lifts.deadlift,
  }, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data as StrengthGoal
}
