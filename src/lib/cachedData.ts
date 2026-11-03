import { isArray, readCache, writeCache } from './localCache'
import type { BodyweightLog } from './bodyweight'
import type { StrengthSnapshot } from '../features/strength/strengthSnapshot'
import type { StrengthGoal } from '../features/strength/queries'

/**
 * 複数の画面で使う読み込み結果の、端末の保存（`localCache`）。読み込みのたびに保存し（`remember…`）、
 * 画面は開いた瞬間に前回の分（`cached…`）を出してから、読み直した結果で差し替える。
 */
function isSnapshot(value: unknown): value is StrengthSnapshot {
  const lifts = (value as StrengthSnapshot | null)?.lifts
  return typeof lifts === 'object' && lifts !== null && ['squat', 'bench', 'deadlift'].every((key) => key in lifts)
}

export const cachedStrengthSnapshot = (userId: string | null) => readCache(userId, 'big3', isSnapshot)
export const rememberStrengthSnapshot = (userId: string, snapshot: StrengthSnapshot) => writeCache(userId, 'big3', snapshot)

export const cachedStrengthGoals = (userId: string | null) => readCache<StrengthGoal[]>(userId, 'goals', isArray)
export const rememberStrengthGoals = (userId: string, goals: StrengthGoal[]) => writeCache(userId, 'goals', goals)

export const cachedBodyweightLogs = (userId: string | null) => readCache<BodyweightLog[]>(userId, 'bodyweight', isArray)
export const rememberBodyweightLogs = (userId: string, logs: BodyweightLog[]) => writeCache(userId, 'bodyweight', logs)
