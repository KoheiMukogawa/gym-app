import type { BodyweightLog } from './bodyweight'

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

/** 今日から months ヶ月前までの記録。境界日はふくむ。 */
export function withinPeriod(logs: BodyweightLog[], months: number, today = new Date().toLocaleDateString('sv-SE')): BodyweightLog[] {
  const base = new Date(today + 'T12:00:00')
  base.setMonth(base.getMonth() - months)
  const from = base.toLocaleDateString('sv-SE')
  return logs.filter((logEntry) => logEntry.recorded_on >= from)
}

/** 体脂肪率の入力値を検証して数値にする。 */
export function parseBodyFat(value: string): number | null {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) && parsed >= 1 && parsed <= 70 ? round1(parsed) : null
}
