import { describe, expect, it } from 'vitest'
import {
  bestEstimatedOneRepMax,
  bestSingle,
  currentEstimatedOneRepMax,
  estimateOneRepMax,
  estimatedOneRepMaxByDate,
  repPersonalBest,
  strengthTotal,
} from './strength'

describe('estimateOneRepMax', () => {
  it('returns the actual weight for a single', () => {
    expect(estimateOneRepMax(190, 1)).toBe(190)
  })

  it('uses the Brzycki formula for multi-rep sets', () => {
    expect(estimateOneRepMax(80, 8)).toBe(99.3)
  })

  it('ignores sets above 10 reps', () => {
    expect(estimateOneRepMax(60, 12)).toBeNull()
  })
})

describe('bestSingle', () => {
  it('uses only sets recorded as one rep', () => {
    expect(bestSingle([
      { weight_kg: 170, reps: 4 },
      { weight_kg: 190, reps: 1 },
      { weight_kg: 180, reps: 3 },
    ])).toBe(190)
  })
})

describe('bestEstimatedOneRepMax', () => {
  it('returns the best estimate across eligible sets', () => {
    expect(bestEstimatedOneRepMax([
      { weight_kg: 80, reps: 8 },
      { weight_kg: 90, reps: 3 },
    ])).toBe(99.3)
  })
})

describe('currentEstimatedOneRepMax', () => {
  it('only uses sets inside the requested time window', () => {
    const now = new Date('2026-09-29T12:00:00Z')
    expect(currentEstimatedOneRepMax([
      { weight_kg: 100, reps: 5, performed_at: '2026-08-01T12:00:00Z' },
      { weight_kg: 90, reps: 5, performed_at: '2026-09-20T12:00:00Z' },
    ], now, 30)).toBe(101.3)
  })
})

describe('strengthTotal', () => {
  it('adds all three lifts', () => {
    expect(strengthTotal([190, 94, 193])).toBe(477)
  })

  it('returns null when one lift is missing', () => {
    expect(strengthTotal([190, null, 193])).toBeNull()
  })
})


describe('repPersonalBest', () => {
  it('uses the heaviest set completed for at least the target reps', () => {
    expect(repPersonalBest([
      { weight_kg: 100, reps: 3 },
      { weight_kg: 95, reps: 5 },
      { weight_kg: 90, reps: 8 },
    ], 5)).toBe(95)
  })
})

describe('estimatedOneRepMaxByDate', () => {
  it('keeps the best estimate per day in chronological order', () => {
    expect(estimatedOneRepMaxByDate([
      { weight_kg: 75, reps: 8, performed_at: '2026-09-01T10:00:00Z' },
      { weight_kg: 80, reps: 8, performed_at: '2026-09-08T10:00:00Z' },
      { weight_kg: 78, reps: 8, performed_at: '2026-09-08T10:20:00Z' },
    ])).toEqual([
      { date: '2026-09-01', e1rm: 93.1 },
      { date: '2026-09-08', e1rm: 99.3 },
    ])
  })
})
