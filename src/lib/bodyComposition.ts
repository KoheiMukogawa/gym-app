import type { BodyweightLog } from './bodyweight'
import { periodStart } from './dates'

export type BodyMetric = 'bodyweight_kg' | 'body_fat_pct'
export type TrendPoint = { date: string; value: number; average: number }

const round1 = (value: number) => Math.round(value * 10) / 10

/** 指定日から days 日前の日付（YYYY-MM-DD）。 */
function daysBefore(date: string, days: number): string {
  const base = new Date(date + 'T12:00:00')
  base.setDate(base.getDate() - days)
  return base.toLocaleDateString('sv-SE')
}

/**
 * その指標を持つ記録だけを古い順に並べ、各点に移動平均を添える。
 * 平均はその日を含む windowDays 日間の記録の平均で、記録のない日は数に入れない。
 * 体重は日々ぶれるため、増減の向きはこの平均で読む。
 */
export function movingAverage(logs: BodyweightLog[], metric: BodyMetric, windowDays = 7): TrendPoint[] {
  const points = logs
    .map((logEntry) => ({ date: logEntry.recorded_on, value: logEntry[metric] }))
    .filter((point): point is { date: string; value: number } => typeof point.value === 'number')
    .sort((a, b) => a.date.localeCompare(b.date))

  return points.map((point, index) => {
    const from = daysBefore(point.date, windowDays - 1)
    let sum = 0
    let count = 0
    for (let i = index; i >= 0; i--) {
      if (points[i].date < from) break
      sum += points[i].value
      count += 1
    }
    return { date: point.date, value: point.value, average: round1(sum / count) }
  })
}

export type CombinedPoint = {
  date: string
  weight: number | null; weightAverage: number | null
  fat: number | null; fatAverage: number | null
}

/** 体重と体脂肪率を日付ごとの1行にまとめる。体脂肪率のない日はその列を null にする。 */
export function combineTrends(logs: BodyweightLog[]): CombinedPoint[] {
  const rows = new Map<string, CombinedPoint>()
  const row = (date: string) => {
    if (!rows.has(date)) rows.set(date, { date, weight: null, weightAverage: null, fat: null, fatAverage: null })
    return rows.get(date)!
  }
  for (const p of movingAverage(logs, 'bodyweight_kg')) Object.assign(row(p.date), { weight: p.value, weightAverage: p.average })
  for (const p of movingAverage(logs, 'body_fat_pct')) Object.assign(row(p.date), { fat: p.value, fatAverage: p.average })
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export type LatestSummary = { date: string; weight: number; weightChange: number | null; fat: number | null; fatChange: number | null }

/** 最新の記録と前回比。体脂肪率は、体脂肪率のある直前の記録と比べる。 */
export function latestSummary(logs: BodyweightLog[]): LatestSummary | null {
  const sorted = [...logs].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
  const latest = sorted.at(-1)
  if (!latest) return null
  const previous = sorted.at(-2)
  const fat = typeof latest.body_fat_pct === 'number' ? latest.body_fat_pct : null
  const previousFat = sorted.slice(0, -1).reverse().find((l) => typeof l.body_fat_pct === 'number')?.body_fat_pct
  return {
    date: latest.recorded_on,
    weight: latest.bodyweight_kg,
    weightChange: previous ? round1(latest.bodyweight_kg - previous.bodyweight_kg) : null,
    fat,
    fatChange: fat !== null && typeof previousFat === 'number' ? round1(fat - previousFat) : null,
  }
}

/** 今日から months ヶ月前までの記録。境界日はふくむ。 */
export function withinPeriod(logs: BodyweightLog[], months: number, today = new Date().toLocaleDateString('sv-SE')): BodyweightLog[] {
  const from = periodStart(months, today)
  return logs.filter((logEntry) => logEntry.recorded_on >= from)
}

/** 体脂肪率の入力値を検証して数値にする。 */
export function parseBodyFat(value: string): number | null {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) && parsed >= 1 && parsed <= 70 ? round1(parsed) : null
}
