import { describe, expect, it } from 'vitest'
import { dotsLevel, dotsScore } from './dots'

describe('dotsScore', () => {
  // Expected values come from public.dots_points so the calculator matches the ranking.
  it.each([
    [500, 80, 'male', 344.7732],
    [700, 93, 'male', 445.3758],
    [300, 60, 'female', 332.5637],
    [400, 30, 'male', 508.444],
    [400, 250, 'male', 198.2483],
    [300, 200, 'female', 231.227],
  ] as const)('%s kg at %s kg (%s) matches the database', (total, bodyweight, formula, expected) => {
    expect(dotsScore(total, bodyweight, formula)).toBeCloseTo(expected, 3)
  })

  it('returns null for missing or non-positive input', () => {
    expect(dotsScore(0, 80, 'male')).toBeNull()
    expect(dotsScore(500, 0, 'male')).toBeNull()
    expect(dotsScore(Number.NaN, 80, 'female')).toBeNull()
  })
})

describe('dotsLevel', () => {
  it('picks the band whose lower bound the score reaches', () => {
    expect(dotsLevel(150)[2]).toBe('初心者')
    expect(dotsLevel(300)[2]).toBe('中級')
    expect(dotsLevel(449.9)[2]).toBe('上級')
    expect(dotsLevel(620)[2]).toBe('エリート級')
  })
})
