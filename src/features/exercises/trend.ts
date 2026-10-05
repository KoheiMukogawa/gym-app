import { localDate, periodStart } from '../../lib/dates'

export type TrendPoint = { date: string; e1rm: number }

export const TREND_PERIODS: { months: number | null; label: string }[] = [
  { months: 3, label: '3ヶ月' }, { months: 6, label: '6ヶ月' }, { months: 12, label: '1年' }, { months: null, label: '全期間' },
]

/** 表示する日がこれより多いと、日ごとの点が重なって線が見えなくなる。 */
export const DOT_LIMIT = 30

export function pointsInPeriod(points: TrendPoint[], months: number | null, today = localDate()): TrendPoint[] {
  if (months === null) return points
  const from = periodStart(months, today)
  return points.filter((p) => p.date >= from)
}

/** 最初は6ヶ月で開く。6ヶ月に2日未満しかなければ線にならないので全期間で開く。 */
export function initialPeriod(points: TrendPoint[], today = localDate()): number | null {
  return pointsInPeriod(points, 6, today).length >= 2 ? 6 : null
}

export function spansYears(points: TrendPoint[]): boolean {
  return points.length > 0 && points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4)
}

export function trendDate(date: string, withYear: boolean): string {
  return (withYear ? date.slice(2) : date.slice(5)).replaceAll('-', '/')
}
