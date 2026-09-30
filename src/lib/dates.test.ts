import { describe, it, expect } from 'vitest'
import { localDate, workoutDateISO, validateSet } from './dates'

describe('workout dates and numbers', () => {
  it('round trips a past local day without UTC day shifts', () => {
    expect(localDate(workoutDateISO('2020-01-02'))).toBe('2020-01-02')
  })
  it('preserves local time when changing an existing workout date', () => {
    const original = new Date(2020, 0, 1, 0, 30).toISOString()
    const next = new Date(workoutDateISO('2020-01-02', original))
    expect(next.getHours()).toBe(0)
    expect(next.getMinutes()).toBe(30)
    expect(localDate(next)).toBe('2020-01-02')
  })
  it.each(['', '2020-02-31', '2099-01-01', 'invalid'])('rejects invalid or future dates: %s', (date) => {
    expect(() => workoutDateISO(date)).toThrow()
  })
  it.each([[NaN, 8], [-1, 8], [10000, 8], [20.12, 8], [20, 0], [20, 1.5], [20, Infinity]])('rejects invalid set values %s / %s', (weight, reps) => {
    expect(() => validateSet(weight, reps)).toThrow()
  })
  it('accepts bodyweight and fractional kilograms', () => {
    expect(() => validateSet(0, 10)).not.toThrow()
    expect(() => validateSet(62.5, 8)).not.toThrow()
  })
})
