import type { SetWithDate, WorkoutSet } from './types'

export const WEIGHT_STEP = 2.5
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

export function adjustWeight(current: number, direction: 1 | -1): number {
  const next = current + WEIGHT_STEP * direction
  // 0.1 + 2.5 のような加算で生じる誤差を落とす
  return Math.max(0, Math.round(next * 10) / 10)
}

export function adjustReps(current: number, direction: 1 | -1): number {
  return Math.max(1, current + direction)
}
