import { describe, expect, it } from 'vitest'
import { movingAverage, parseBodyFat, withinPeriod } from './bodyComposition'

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
