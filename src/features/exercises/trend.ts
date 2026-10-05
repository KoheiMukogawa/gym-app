import { localDate, periodStart } from '../../lib/dates'

export type TrendPoint = { date: string; e1rm: number }
/** 表示する点の添字の範囲。指の動きに合わせてなめらかに動かすため小数も持つ。 */
export type TrendRange = { start: number; end: number }

/** 表示する日がこれより多いと、日ごとの点が重なって線が見えなくなる。 */
export const DOT_LIMIT = 30

export function pointsInPeriod(points: TrendPoint[], months: number, today = localDate()): TrendPoint[] {
  const from = periodStart(months, today)
  return points.filter((p) => p.date >= from)
}

/** 最初は直近6ヶ月を表示する。6ヶ月に2日未満しかなければ線にならないので全期間を表示する。 */
export function initialRange(points: TrendPoint[], today = localDate()): TrendRange {
  const recent = pointsInPeriod(points, 6, today).length
  const end = points.length - 1
  return { start: recent >= 2 ? points.length - recent : 0, end }
}

/** 拡大の上限。これ以上拡大しても点の間隔が広がるだけになる。 */
function minSpan(count: number): number {
  return Math.min(count - 1, 6)
}

function place(start: number, span: number, count: number): TrendRange {
  const s = Math.min(Math.max(start, 0), count - 1 - span)
  return { start: s, end: s + span }
}

/**
 * 2本指の拡大・縮小。scale は表示する日数の倍率（2本指を広げると1未満）。
 * anchor は指を置いたときの中心が元の範囲のどこか、at は今の中心が画面のどこかを0〜1で表す。
 */
export function zoomRange(range: TrendRange, count: number, scale: number, anchor: number, at: number): TrendRange {
  const span = Math.min(Math.max((range.end - range.start) * scale, minSpan(count)), count - 1)
  return place(range.start + anchor * (range.end - range.start) - at * span, span, count)
}

/** 拡大中に左右へなぞったときの移動。delta は日数（点の数）。 */
export function panRange(range: TrendRange, count: number, delta: number): TrendRange {
  return place(range.start + delta, range.end - range.start, count)
}

export function visiblePoints(points: TrendPoint[], range: TrendRange): TrendPoint[] {
  return points.slice(Math.round(range.start), Math.round(range.end) + 1)
}

export function isZoomed(range: TrendRange, count: number): boolean {
  return Math.round(range.start) > 0 || Math.round(range.end) < count - 1
}

export function spansYears(points: TrendPoint[]): boolean {
  return points.length > 0 && points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4)
}

export function trendDate(date: string, withYear: boolean): string {
  return (withYear ? date.slice(2) : date.slice(5)).replaceAll('-', '/')
}
