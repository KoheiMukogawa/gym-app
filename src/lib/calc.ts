import type { SetWithDate, WorkoutSet } from './types'
import { localDate } from './dates'
import { bestEstimatedOneRepMax, estimateOneRepMax, estimateRepsAt } from './strength'

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

export type RepSuggestion = { reps: number; source: 'record' | 'estimate' }

type RepPoint = { weight: number; reps: number }

/**
 * その種目の「重量 → その重量での最高レップ数」を軽い順に並べた、本人の実測カーブ。
 * 同じ重量に複数の記録があれば最高回数だけを採る（疲労した後半セットに引きずられないため）。
 */
function repCurve(
  history: Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[],
  exerciseId: string,
  loadOffset: number,
): RepPoint[] {
  const best = new Map<number, number>()
  for (const set of history) {
    if (set.exercise_id !== exerciseId) continue
    const weight = set.weight_kg + loadOffset
    const current = best.get(weight)
    if (current === undefined || set.reps > current) best.set(weight, set.reps)
  }
  return [...best.entries()]
    .map(([weight, reps]) => ({ weight, reps }))
    .sort((a, b) => a.weight - b.weight)
}

/** 2点を結ぶ直線で、target の重量における回数を求める。 */
function alongLine(from: RepPoint, to: RepPoint, target: number): number {
  const slope = (to.reps - from.reps) / (to.weight - from.weight)
  return to.reps + (target - to.weight) * slope
}

/**
 * その重量で狙う回数の提案。
 *
 * 1. その重量の記録があればその最高回数（実績がいちばん確か）
 * 2. 前後に記録があれば、その2点を結んで内挿する
 * 3. どの記録より重ければ、重い側2点の傾きで外挿し、推定1RMからの逆算と比べて低いほうを採る
 *    （万人共通の式は高回数の記録から1RMを高く見積もりがちなので、本人のカーブで抑える）
 * 4. 記録が1点しかなければ、推定1RMから逆算する
 * 5. どの記録より軽ければ、確かなことが言えないので提案しない
 *
 * 最後に「重い重量のほうが回数が多い」提案にならないよう、前後の記録で挟む。
 * loadOffset は自重種目の体重分で、総重量に換算するために使う。
 */
export function suggestReps(
  history: Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[],
  exerciseId: string,
  weightKg: number,
  loadOffset = 0,
): RepSuggestion | null {
  const curve = repCurve(history, exerciseId, loadOffset)
  if (curve.length === 0) return null
  const target = weightKg + loadOffset

  const exact = curve.find((point) => Math.abs(point.weight - target) < 1e-9)
  if (exact) return { reps: exact.reps, source: 'record' }

  const below = [...curve].reverse().find((point) => point.weight < target)
  const above = curve.find((point) => point.weight > target)

  let candidate: number | null = null
  if (below && above) {
    candidate = alongLine(below, above, target)
  } else if (below) {
    const second = curve[curve.length - 2]
    // 傾きが下向きのときだけ外挿する。横ばい（軽い重量で回数が変わらない）の
    // 傾きを伸ばすと、重くしても回数が減らない提案になってしまう。
    const slope = second ? (below.reps - second.reps) / (below.weight - second.weight) : 0
    const extrapolated = second && slope < 0 ? alongLine(second, below, target) : null
    const oneRepMax = bestEstimatedOneRepMax(curve.map((p) => ({ weight_kg: p.weight, reps: p.reps })))
    const formula = oneRepMax === null ? null : estimateRepsAt(oneRepMax, target)
    const options = [extrapolated, formula].filter((value): value is number => value !== null)
    candidate = options.length === 0 ? null : Math.min(...options)
  }
  if (candidate === null) return null

  let reps = Math.floor(candidate)
  // 軽い側の記録より多くは挙がらない / 重い側の記録より少なくはならない
  if (below) reps = Math.min(reps, below.reps)
  if (above) reps = Math.max(reps, above.reps)
  return { reps: Math.max(1, reps), source: 'estimate' }
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
