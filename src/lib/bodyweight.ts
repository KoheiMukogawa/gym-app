export type BodyweightLog = { recorded_on: string; bodyweight_kg: number; body_fat_pct?: number | null }

/**
 * その日に有効な体重。recorded_on 以前で最も新しい記録を使い、
 * それより前のセットには最初の記録を当てる（体重を記録し始める前の自重種目のため）。
 */
export function bodyweightOn(logs: BodyweightLog[], date: string): number | null {
  if (logs.length === 0) return null
  const sorted = [...logs].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
  let found = sorted[0].bodyweight_kg
  for (const log of sorted) {
    if (log.recorded_on > date) break
    found = log.bodyweight_kg
  }
  return Number(found)
}

export function latestBodyweight(logs: BodyweightLog[]): number | null {
  return logs.length === 0 ? null : bodyweightOn(logs, '9999-12-31')
}

/** 自重種目の加重表示。0 は「自重」、プラスは加重、マイナスはアシスト。 */
export function formatAddedLoad(weight: number): string {
  if (weight === 0) return '自重'
  const abs = Number.isInteger(Math.abs(weight)) ? String(Math.abs(weight)) : Math.abs(weight).toFixed(1)
  return (weight > 0 ? '+' : '−') + abs + ' kg'
}

/** 体重込みの総重量。体重が分からないときは null。 */
export function totalLoad(weight: number, bodyweight: number | null): number | null {
  if (bodyweight === null) return null
  return Math.round((weight + bodyweight) * 10) / 10
}
