import { describe, expect, it } from 'vitest'
import { bodyweightOn, formatAddedLoad, latestBodyweight, totalLoad } from './bodyweight'

const logs = [
  { recorded_on: '2026-09-01', bodyweight_kg: 70 },
  { recorded_on: '2026-10-01', bodyweight_kg: 72.5 },
]

describe('bodyweight helpers', () => {
  it('uses the bodyweight in effect on the date', () => {
    expect(bodyweightOn(logs, '2026-09-15')).toBe(70)
    expect(bodyweightOn(logs, '2026-10-01')).toBe(72.5)
  })
  it('falls back to the first log for sets before any record, and null without logs', () => {
    expect(bodyweightOn(logs, '2026-01-01')).toBe(70)
    expect(bodyweightOn([], '2026-01-01')).toBeNull()
    expect(latestBodyweight(logs)).toBe(72.5)
  })
  it('formats added, assisted and bodyweight-only loads', () => {
    expect(formatAddedLoad(10)).toBe('+10 kg')
    expect(formatAddedLoad(-22.5)).toBe('−22.5 kg')
    expect(formatAddedLoad(0)).toBe('自重')
  })
  it('adds the bodyweight to the added load', () => {
    expect(totalLoad(-20, 70)).toBe(50)
    expect(totalLoad(10, null)).toBeNull()
  })
})
