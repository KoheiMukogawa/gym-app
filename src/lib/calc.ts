import type { SetWithDate, WorkoutSet } from './types'
import { localDate } from './dates'
import { estimateOneRepMax } from './strength'

export const WEIGHT_STEP = 2.5
export const MIN_WEIGHT = 0
export const MIN_REPS = 1
export const DEFAULT_WEIGHT = 20
export const DEFAULT_REPS = 10

/** 種目名の表記揺れを吸収する。重複検出とサジェストに使う。 */
export function normalizeExerciseName(name: string): string {
  return name.toLowerCase().replace(/[\s　]/g, '')
}

export function totalVolume(sets: Pick<WorkoutSet, 'weight_kg' | 'reps'>[]): number {
  return sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
}

export function personalBest(sets: Pick<WorkoutSet, 'weight_kg'>[]): number | null {
  if (sets.length === 0) return null
  return sets.reduce((max, s) => (s.weight_kg > max ? s.weight_kg : max), sets[0].weight_kg)
}

/**
 * 前回値を探す。history は新しい順に並んでいることを前提とし、
 * 最初に一致した要素を返す。並び順の保証は呼び出し側のクエリが持つ。
 */
export function findPrefill(
  history: Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[],
  exerciseId: string,
): { weight_kg: number; reps: number } | null {
  const hit = history.find((s) => s.exercise_id === exerciseId)
  if (!hit) return null
  return { weight_kg: hit.weight_kg, reps: hit.reps }
}

/**
 * その種目・その重量で、過去に挙げられた最大レップ数。記録がなければ null。
 * 重量を選んだときのレップ数の初期値に使う。
 */
export function maxRepsAt(
  history: Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[],
  exerciseId: string,
  weightKg: number,
): number | null {
  let best: number | null = null
  for (const set of history) {
    if (set.exercise_id !== exerciseId) continue
    // numeric(5,1) 同士なので誤差は出ないが、浮動小数の比較として安全側に倒す
    if (Math.abs(set.weight_kg - weightKg) > 1e-9) continue
    if (best === null || set.reps > best) best = set.reps
  }
  return best
}

/** 日付ごとの最大重量を、古い順に返す。 */
export function maxWeightByDate(sets: SetWithDate[]): { date: string; max_weight: number }[] {
  const byDate = new Map<string, number>()
  for (const s of sets) {
    const date = s.performed_at.slice(0, 10)
    const current = byDate.get(date)
    if (current === undefined || s.weight_kg > current) {
      byDate.set(date, s.weight_kg)
    }
  }
  return [...byDate.entries()]
    .map(([date, max_weight]) => ({ date, max_weight }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 日ごとの最高推定1RM（1〜10回のセットのみ）を、古い順に返す。日付は端末の暦日。 */
export function e1rmByDate(sets: SetWithDate[]): { date: string; e1rm: number }[] {
  const byDate = new Map<string, number>()
  for (const s of sets) {
    const e1rm = estimateOneRepMax(s.weight_kg, s.reps)
    if (e1rm === null) continue
    const date = localDate(s.performed_at)
    const current = byDate.get(date)
    if (current === undefined || e1rm > current) byDate.set(date, e1rm)
  }
  return [...byDate.entries()]
    .map(([date, e1rm]) => ({ date, e1rm }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function adjustWeight(current: number, direction: 1 | -1): number {
  const next = current + WEIGHT_STEP * direction
  // 0.1 + 2.5 のような加算で生じる誤差を落とす
  return Math.max(MIN_WEIGHT, Math.round(next * 10) / 10)
}

export function adjustReps(current: number, direction: 1 | -1): number {
  return Math.max(MIN_REPS, current + direction)
}
