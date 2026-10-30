import { supabase } from '../../lib/supabase'
import { InputError } from '../../lib/errors'
import type { StrengthGoal } from './queries'

// Keep old goals intact, but expose one stable goal regardless of progress.
export function currentGoal(goals: StrengthGoal[]): StrengthGoal | null {
  return [...goals].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] ?? null
}

export type LiftTargets = { squat: number | null; bench: number | null; deadlift: number | null }
export type GoalStarts = LiftTargets & { total: number | null }

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * 目標を決めた時点の推定1RM（スタート地点）。目標の値が変わった種目（と合計）は今の値で取り直し、
 * 変わっていないもの（期限だけ変えたときなど）は前のスタートを残す。記録が無い・0以下なら null。
 */
export function goalStarts(existing: StrengthGoal | null, targets: LiftTargets & { total: number }, current: GoalStarts): GoalStarts {
  const pick = (target: number | null, oldTarget: number | null | undefined, oldStart: number | null | undefined, now: number | null) => {
    if (target === null) return null
    if (existing && oldTarget != null && Number(oldTarget) === target && oldStart != null) return Number(oldStart)
    return now !== null && now > 0 ? round1(now) : null
  }
  return {
    total: pick(targets.total, existing?.target_total_kg, existing?.start_total_kg, current.total),
    squat: pick(targets.squat, existing?.target_squat_kg, existing?.start_squat_kg, current.squat),
    bench: pick(targets.bench, existing?.target_bench_kg, existing?.start_bench_kg, current.bench),
    deadlift: pick(targets.deadlift, existing?.target_deadlift_kg, existing?.start_deadlift_kg, current.deadlift),
  }
}

function validWeight(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 9999.9 && Math.abs(value * 10 - Math.round(value * 10)) <= 1e-7
}

export async function saveCurrentGoal(input: {
  userId: string; existing: StrengthGoal | null; targetDate: string; targetTotalKg: number
  /** 種目別の目標（任意）。null は設定しない */
  liftTargets?: LiftTargets
  /** 目標を決めた時点の推定1RM（goalStarts で決める） */
  starts?: GoalStarts
}): Promise<StrengthGoal> {
  const { userId, existing, targetDate, targetTotalKg } = input
  const lifts = input.liftTargets ?? { squat: null, bench: null, deadlift: null }
  const starts = input.starts ?? { total: null, squat: null, bench: null, deadlift: null }
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
    start_total_kg: starts.total, start_squat_kg: starts.squat, start_bench_kg: starts.bench, start_deadlift_kg: starts.deadlift,
  }, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data as StrengthGoal
}
