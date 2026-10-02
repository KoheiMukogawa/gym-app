import { describe, expect, it } from 'vitest'
import { combineTrends, latestSummary, movingAverage, parseBodyFat, withinPeriod } from './bodyComposition'

const log = (recorded_on: string, bodyweight_kg: number, body_fat_pct?: number) => ({ recorded_on, bodyweight_kg, body_fat_pct })

describe('movingAverage', () => {
  it('averages the record itself and the six days before it', () => {
    const logs = [log('2026-09-01', 70), log('2026-09-02', 71), log('2026-09-03', 72)]
    expect(movingAverage(logs, 'bodyweight_kg')).toEqual([
      { date: '2026-09-01', value: 70, average: 70 },
      { date: '2026-09-02', value: 71, average: 70.5 },
      { date: '2026-09-03', value: 72, average: 71 },
    ])
  })

  it('drops days outside the window instead of carrying them forward', () => {
    // 9/01 は 9/10 の7日窓（9/04〜9/10）の外なので平均に入らない
    const logs = [log('2026-09-01', 60), log('2026-09-09', 70), log('2026-09-10', 72)]
    expect(movingAverage(logs, 'bodyweight_kg').at(-1)).toEqual({ date: '2026-09-10', value: 72, average: 71 })
  })

  it('skips records that have no value for the metric', () => {
    const logs = [log('2026-09-01', 70, 20), log('2026-09-02', 71), log('2026-09-03', 72, 18)]
    expect(movingAverage(logs, 'body_fat_pct')).toEqual([
      { date: '2026-09-01', value: 20, average: 20 },
      { date: '2026-09-03', value: 18, average: 19 },
    ])
  })

  it('returns nothing when no record carries the metric', () => {
    expect(movingAverage([log('2026-09-01', 70)], 'body_fat_pct')).toEqual([])
    expect(movingAverage([], 'bodyweight_kg')).toEqual([])
  })

  it('rounds the average to one decimal', () => {
    const logs = [log('2026-09-01', 70), log('2026-09-02', 70), log('2026-09-03', 71)]
    expect(movingAverage(logs, 'bodyweight_kg').at(-1)!.average).toBe(70.3)
  })
})

describe('withinPeriod', () => {
  const logs = [log('2026-07-15', 70), log('2026-09-20', 71), log('2026-10-01', 72)]

  it('keeps records inside the window, counting back from today', () => {
    expect(withinPeriod(logs, 1, '2026-10-02').map((l) => l.recorded_on)).toEqual(['2026-09-20', '2026-10-01'])
    expect(withinPeriod(logs, 12, '2026-10-02')).toHaveLength(3)
  })

  it('includes a record landing exactly on the boundary', () => {
    expect(withinPeriod([log('2026-09-02', 70)], 1, '2026-10-02')).toHaveLength(1)
  })
})

describe('parseBodyFat', () => {
  it('accepts a percentage between 1 and 70', () => {
    expect(parseBodyFat('15.4')).toBe(15.4)
    expect(parseBodyFat('1')).toBe(1)
    expect(parseBodyFat('70')).toBe(70)
  })

  it('rejects anything outside that range or not a number', () => {
    expect(parseBodyFat('0.9')).toBeNull()
    expect(parseBodyFat('71')).toBeNull()
    expect(parseBodyFat('')).toBeNull()
    expect(parseBodyFat('abc')).toBeNull()
  })
})


describe('calendar period boundaries', () => {
  it.each([['2026-03-31',1,'2026-02-28'],['2024-03-31',1,'2024-02-29'],['2024-02-29',12,'2023-02-28'],['2026-05-31',3,'2026-02-28']])('clamps %s minus %i months to %s', (today, months, boundary) => {
    const before = new Date(boundary + 'T12:00:00')
    before.setDate(before.getDate() - 1)
    const logs = [log(before.toLocaleDateString('sv-SE'),70),log(boundary,71),log(today,72)]
    expect(withinPeriod(logs,months,today).map((row) => row.recorded_on)).toEqual([boundary,today])
  })
})

describe('combineTrends', () => {
  it('puts weight and body fat for the same day on one row with each 7-day average', () => {
    expect(combineTrends([
      { recorded_on: '2026-09-01', bodyweight_kg: 70, body_fat_pct: 16 },
      { recorded_on: '2026-09-02', bodyweight_kg: 71, body_fat_pct: null },
      { recorded_on: '2026-09-03', bodyweight_kg: 72, body_fat_pct: 15 },
    ])).toEqual([
      { date: '2026-09-01', weight: 70, weightAverage: 70, fat: 16, fatAverage: 16 },
      { date: '2026-09-02', weight: 71, weightAverage: 70.5, fat: null, fatAverage: null },
      { date: '2026-09-03', weight: 72, weightAverage: 71, fat: 15, fatAverage: 15.5 },
    ])
  })

  it('returns nothing without records', () => {
    expect(combineTrends([])).toEqual([])
  })
})

describe('latestSummary', () => {
  it('compares body fat with the last record that has one', () => {
    expect(latestSummary([
      { recorded_on: '2026-09-01', bodyweight_kg: 70, body_fat_pct: 16 },
      { recorded_on: '2026-09-02', bodyweight_kg: 71, body_fat_pct: null },
      { recorded_on: '2026-09-03', bodyweight_kg: 70.4, body_fat_pct: 15.4 },
    ])).toEqual({ date: '2026-09-03', weight: 70.4, weightChange: -0.6, fat: 15.4, fatChange: -0.6 })
  })

  it('has no change for a first record or a latest record without body fat', () => {
    expect(latestSummary([{ recorded_on: '2026-09-01', bodyweight_kg: 70, body_fat_pct: 16 }]))
      .toEqual({ date: '2026-09-01', weight: 70, weightChange: null, fat: 16, fatChange: null })
    expect(latestSummary([
      { recorded_on: '2026-09-01', bodyweight_kg: 70, body_fat_pct: 16 },
      { recorded_on: '2026-09-02', bodyweight_kg: 70, body_fat_pct: null },
    ])).toEqual({ date: '2026-09-02', weight: 70, weightChange: 0, fat: null, fatChange: null })
  })

  it('returns null without records', () => {
    expect(latestSummary([])).toBeNull()
  })
})
