import { workoutDateISO } from '../../lib/dates'
import { InputError } from '../../lib/errors'
import { parseNumber } from '../../lib/numbers'
import { estimateOneRepMax, MAX_E1RM_REPS } from '../../lib/strength'
import type { LiftKey } from './strengthSnapshot'

export type BestInput = { weight: string; reps: string }

export type BestCheck =
  | { status: 'empty' }
  | { status: 'invalid'; error: string }
  | { status: 'ok'; weightKg: number; reps: number; e1rm: number }

export type StartingBest = { lift: LiftKey; exerciseId: string; weightKg: number; reps: number }

const WEIGHT_ERROR = '重量は0より大きく9999.9kg以下、小数1桁までで入力してください'
const REPS_ERROR = '回数は1〜10の整数で入力してください'

/** Reps has a default, so a row counts as entered only once its weight is filled. */
export function checkBest(input: BestInput): BestCheck {
  if (input.weight.trim() === '') return { status: 'empty' }
  if (input.reps.trim() === '') return { status: 'invalid', error: '重量と回数の両方を入れてください' }
  const weightKg = parseNumber(input.weight)
  if (weightKg === null || weightKg <= 0 || weightKg > 9999.9 || Math.abs(weightKg * 10 - Math.round(weightKg * 10)) > 1e-7) {
    return { status: 'invalid', error: WEIGHT_ERROR }
  }
  const reps = parseNumber(input.reps)
  if (reps === null || !Number.isInteger(reps) || reps < 1) return { status: 'invalid', error: REPS_ERROR }
  if (reps > MAX_E1RM_REPS) {
    return { status: 'invalid', error: '11回以上は推定の誤差が大きいため使えません。10回以下の記録を入れてください' }
  }
  return { status: 'ok', weightKg, reps, e1rm: estimateOneRepMax(weightKg, reps)! }
}

/** Same rules as saving a dated workout: a real date, today or earlier. */
export function checkStartingDate(date: string): string | null {
  try {
    workoutDateISO(date)
    return null
  } catch (error) {
    if (error instanceof InputError) return error.message
    throw error
  }
}

export function startingTotal(checks: BestCheck[]): { total: number; count: number } | null {
  const values = checks.flatMap((check) => (check.status === 'ok' ? [check.e1rm] : []))
  if (values.length === 0) return null
  return { total: Math.round(values.reduce((sum, v) => sum + v, 0) * 10) / 10, count: values.length }
}
