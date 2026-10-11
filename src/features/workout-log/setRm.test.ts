import { expect, it } from 'vitest'
import { bestEstimatedOneRepMax } from '../../lib/strength'
import { setRm } from './setRm'

it('keeps ordinary estimates and labels high repetition references', () => {
  expect(setRm(80, 1)).toEqual({ value: 80, reference: false })
  expect(setRm(80, 10)).toEqual({ value: 106.7, reference: false })
  expect(setRm(80, 11)).toEqual({ value: 109.3, reference: true })
  expect(setRm(80, 14)).toEqual({ value: 117.3, reference: true })
  expect(setRm(80, 30)).toEqual({ value: 160, reference: true })
  expect(bestEstimatedOneRepMax([{ weight_kg: 80, reps: 10 }, { weight_kg: 80, reps: 14 }])).toBe(106.7)
})

it('does not invent estimates for unavailable or unsupported inputs', () => {
  for (const [weight, reps] of [[null, 10], [0, 10], [-10, 10], [80, 0], [80, 31], [80, 1.5], [NaN, 10], [80, Infinity]] as const) {
    expect(setRm(weight, reps)).toBeNull()
  }
})
