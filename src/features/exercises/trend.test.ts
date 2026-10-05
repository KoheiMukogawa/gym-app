import { describe, expect, it } from 'vitest'
import { initialRange, isZoomed, panRange, pointsInPeriod, spansYears, trendDate, visiblePoints, zoomRange } from './trend'

const point = (date: string) => ({ date, e1rm: 100 })

describe('pointsInPeriod', () => {
  const points = ['2025-10-04', '2025-10-05', '2026-04-05', '2026-10-05'].map(point)

  it('keeps the boundary day months before today', () => {
    expect(pointsInPeriod(points, 6, '2026-10-05').map((p) => p.date)).toEqual(['2026-04-05', '2026-10-05'])
    expect(pointsInPeriod(points, 12, '2026-10-05').map((p) => p.date)).toEqual(['2025-10-05', '2026-04-05', '2026-10-05'])
  })
})

describe('initialRange', () => {
  it('opens on the last six months when they have at least two days', () => {
    const points = ['2025-01-01', '2025-02-01', '2026-05-01', '2026-09-01'].map(point)
    expect(initialRange(points, '2026-10-05')).toEqual({ start: 2, end: 3 })
  })

  it('opens on the whole history when six months would show fewer than two days', () => {
    const points = ['2025-01-01', '2025-02-01', '2026-09-01'].map(point)
    expect(initialRange(points, '2026-10-05')).toEqual({ start: 0, end: 2 })
  })
})

describe('zoomRange', () => {
  it('keeps the day under the fingers in place while spreading them', () => {
    // 100日分を全体表示し、中央を2倍に拡大する
    expect(zoomRange({ start: 0, end: 99 }, 100, 0.5, 0.5, 0.5)).toEqual({ start: 24.75, end: 74.25 })
  })

  it('stops at a few days and at the whole history', () => {
    expect(zoomRange({ start: 0, end: 99 }, 100, 0.01, 0.5, 0.5)).toEqual({ start: 46.5, end: 52.5 })
    expect(zoomRange({ start: 40, end: 60 }, 100, 10, 0.5, 0.5)).toEqual({ start: 0, end: 99 })
  })

  it('stays inside the history near the edges', () => {
    expect(zoomRange({ start: 0, end: 99 }, 100, 0.5, 1, 1)).toEqual({ start: 49.5, end: 99 })
  })
})

describe('panRange', () => {
  it('moves without changing the span and stops at both ends', () => {
    expect(panRange({ start: 10, end: 30 }, 100, -5)).toEqual({ start: 5, end: 25 })
    expect(panRange({ start: 10, end: 30 }, 100, -50)).toEqual({ start: 0, end: 20 })
    expect(panRange({ start: 10, end: 30 }, 100, 500)).toEqual({ start: 79, end: 99 })
  })
})

describe('visiblePoints and isZoomed', () => {
  const points = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'].map(point)

  it('shows the days the range covers', () => {
    expect(visiblePoints(points, { start: 0.6, end: 2.4 }).map((p) => p.date)).toEqual(['2026-01-02', '2026-01-03'])
  })

  it('tells whether part of the history is hidden', () => {
    expect(isZoomed({ start: 0, end: 3 }, 4)).toBe(false)
    expect(isZoomed({ start: 1, end: 3 }, 4)).toBe(true)
  })
})

describe('spansYears', () => {
  it('tells whether the shown days cross a year', () => {
    expect(spansYears(['2025-12-30', '2026-01-02'].map(point))).toBe(true)
    expect(spansYears(['2026-01-02', '2026-12-30'].map(point))).toBe(false)
    expect(spansYears([])).toBe(false)
  })
})

describe('trendDate', () => {
  it('adds a short year only when asked', () => {
    expect(trendDate('2025-04-03', false)).toBe('04/03')
    expect(trendDate('2025-04-03', true)).toBe('25/04/03')
  })
})
