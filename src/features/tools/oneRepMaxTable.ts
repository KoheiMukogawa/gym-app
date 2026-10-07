import { estimateRepsAt } from '../../lib/strength'

const PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60] as const

export type PercentageRow = { percent: number; weightKg: number; reps: number | null }

/**
 * 推定1RMの何%が何kgで、その重量なら何回挙がりそうか。回数はアプリの回数提案と同じ
 * Brzycki式の逆算で、10回を超える軽い重量は式の範囲外なので null。
 */
export function percentageTable(oneRepMax: number): PercentageRow[] {
  return PERCENTAGES.map((percent) => {
    const weightKg = Math.round(oneRepMax * percent) / 100
    return { percent, weightKg, reps: percent === 100 ? 1 : estimateRepsAt(oneRepMax, weightKg) }
  })
}
