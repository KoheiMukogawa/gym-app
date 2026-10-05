import { describe, expect, it } from 'vitest'
import { initialPeriod, pointsInPeriod, spansYears, trendDate } from './trend'

const point = (date: string) => ({ date, e1rm: 100 })

describe('pointsInPeriod', () => {
  const points = ['2025-10-04', '2025-10-05', '2026-04-05', '2026-10-05'].map(point)

  it('keeps the boundary day months before today', () => {
    expect(pointsInPeriod(points, 6, '2026-10-05').map((p) => p.date)).toEqual(['2026-04-05', '2026-10-05'])
    expect(pointsInPeriod(points, 12, '2026-10-05').map((p) => p.date)).toEqual(['2025-10-05', '2026-04-05', '2026-10-05'])
  })

  it('keeps everything for the whole period', () => {
    expect(pointsInPeriod(points, null, '2026-10-05')).toBe(points)
  })
})

describe('initialPeriod', () => {
  it('opens on six months when it has at least two days', () => {
    expect(initialPeriod(['2026-05-01', '2026-09-01'].map(point), '2026-10-05')).toBe(6)
  })

  it('opens on the whole period when six months would show fewer than two days', () => {
    expect(initialPeriod(['2025-01-01', '2026-09-01'].map(point), '2026-10-05')).toBeNull()
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
