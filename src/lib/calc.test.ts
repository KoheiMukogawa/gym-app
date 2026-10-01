import { describe, it, expect } from 'vitest'
import {
  normalizeExerciseName,
  totalVolume,
  personalBest,
  findPrefill,
  maxWeightByDate,
  maxRepsAt,
  suggestReps,
  e1rmByDate,
  adjustWeight,
  adjustReps,
} from './calc'
import { estimateRepsAt } from './strength'
import type { SetWithDate } from './types'

describe('normalizeExerciseName', () => {
  it('lowercases and strips whitespace', () => {
    expect(normalizeExerciseName(' Bench Press ')).toBe('benchpress')
  })

  it('treats full-width and half-width spaces the same', () => {
    expect(normalizeExerciseName('ベンチ　プレス')).toBe('ベンチプレス')
  })
})

describe('totalVolume', () => {
  it('sums weight times reps', () => {
    expect(totalVolume([
      { weight_kg: 80, reps: 8 },
      { weight_kg: 80, reps: 6 },
    ])).toBe(1120)
  })

  it('returns 0 for an empty list', () => {
    expect(totalVolume([])).toBe(0)
  })
})

describe('personalBest', () => {
  it('returns the heaviest weight', () => {
    expect(personalBest([
      { weight_kg: 80 },
      { weight_kg: 100 },
      { weight_kg: 90 },
    ])).toBe(100)
  })

  it('returns null for an empty list', () => {
    expect(personalBest([])).toBeNull()
  })
})

describe('findPrefill', () => {
  const history = [
    { exercise_id: 'squat', weight_kg: 100, reps: 5 },
    { exercise_id: 'bench', weight_kg: 80, reps: 8 },
    { exercise_id: 'bench', weight_kg: 75, reps: 10 },
  ]

  it('returns the first matching entry, since history is newest first', () => {
    expect(findPrefill(history, 'bench')).toEqual({ weight_kg: 80, reps: 8 })
  })

  it('returns null when the exercise has no history', () => {
    expect(findPrefill(history, 'deadlift')).toBeNull()
  })
})

describe('maxWeightByDate', () => {
  const set = (id: string, performed_at: string, weight_kg: number): SetWithDate => ({
    id,
    workout_id: 'w',
    exercise_id: 'bench',
    set_index: 1,
    weight_kg,
    reps: 8,
    created_at: performed_at,
    performed_at,
  })

  it('keeps the heaviest set per day, sorted oldest first', () => {
    expect(maxWeightByDate([
      set('a', '2026-08-10T10:00:00Z', 80),
      set('b', '2026-08-10T10:30:00Z', 85),
      set('c', '2026-08-03T10:00:00Z', 75),
    ])).toEqual([
      { date: '2026-08-03', max_weight: 75 },
      { date: '2026-08-10', max_weight: 85 },
    ])
  })

  it('returns an empty array for no sets', () => {
    expect(maxWeightByDate([])).toEqual([])
  })
})

describe('adjustWeight', () => {
  it('steps up by 2.5', () => {
    expect(adjustWeight(80, 1)).toBe(82.5)
  })

  it('steps down by 2.5', () => {
    expect(adjustWeight(80, -1)).toBe(77.5)
  })

  it('never goes below 0', () => {
    expect(adjustWeight(1, -1)).toBe(0)
  })

  it('avoids floating point drift', () => {
    expect(adjustWeight(0.1, 1)).toBe(2.6)
  })
})

describe('adjustReps', () => {
  it('steps by 1', () => {
    expect(adjustReps(8, 1)).toBe(9)
  })

  it('never goes below 1', () => {
    expect(adjustReps(1, -1)).toBe(1)
  })
})

describe('e1rmByDate', () => {
  const base = { id: 's', workout_id: 'w', exercise_id: 'e', set_index: 1, created_at: '' }
  it('keeps the best estimated 1RM per day and skips sets over 10 reps', () => {
    expect(e1rmByDate([
      { ...base, weight_kg: 100, reps: 1, performed_at: '2026-08-10T03:00:00Z' },
      { ...base, weight_kg: 90, reps: 5, performed_at: '2026-08-10T04:00:00Z' },
      { ...base, weight_kg: 60, reps: 15, performed_at: '2026-08-03T03:00:00Z' },
      { ...base, weight_kg: 80, reps: 8, performed_at: '2026-08-03T04:00:00Z' },
    ])).toEqual([
      { date: '2026-08-03', e1rm: 99.3 },
      { date: '2026-08-10', e1rm: 101.3 },
    ])
  })
})

describe('maxRepsAt', () => {
  const history = [
    { exercise_id: 'bench', weight_kg: 80, reps: 5 },
    { exercise_id: 'bench', weight_kg: 80, reps: 8 },
    { exercise_id: 'bench', weight_kg: 82.5, reps: 12 },
    { exercise_id: 'squat', weight_kg: 80, reps: 15 },
  ]
  it('returns the best reps done at that exact weight for that exercise', () => {
    expect(maxRepsAt(history, 'bench', 80)).toBe(8)
    expect(maxRepsAt(history, 'bench', 82.5)).toBe(12)
    expect(maxRepsAt(history, 'squat', 80)).toBe(15)
  })
  it('returns null when that weight has never been lifted for that exercise', () => {
    expect(maxRepsAt(history, 'bench', 100)).toBeNull()
    expect(maxRepsAt(history, 'deadlift', 80)).toBeNull()
    expect(maxRepsAt([], 'bench', 80)).toBeNull()
  })
})

describe('suggestReps', () => {
  const history = [
    { exercise_id: 'bench', weight_kg: 80, reps: 5 },
    { exercise_id: 'bench', weight_kg: 80, reps: 8 },
  ]
  it('prefers what was actually lifted at that weight', () => {
    expect(suggestReps(history, 'bench', 80)).toEqual({ reps: 8, source: 'record' })
  })
  it('falls back to an estimate from the best e1RM', () => {
    // 80kg×8 → 推定1RM 約99.3kg。85kgなら6回、1RM超えは1回。
    expect(suggestReps(history, 'bench', 85)).toEqual({ reps: 6, source: 'estimate' })
    expect(suggestReps(history, 'bench', 120)).toEqual({ reps: 1, source: 'estimate' })
  })
  it('gives nothing when the weight is too light to estimate or the exercise is new', () => {
    expect(suggestReps(history, 'bench', 40)).toBeNull()
    expect(suggestReps(history, 'squat', 80)).toBeNull()
  })
  it('counts bodyweight exercises on their total load', () => {
    // 体重70kg + 加重10kg で8回 → 総重量80kgで8回ぶんの推定1RM
    const chin = [{ exercise_id: 'chin', weight_kg: 10, reps: 8 }]
    expect(suggestReps(chin, 'chin', 15, 70)).toEqual({ reps: 6, source: 'estimate' })
    // 体重を無視すると加重10kgだけで換算してしまい、まったく違う答えになる
    expect(suggestReps(chin, 'chin', 15, 0)).toEqual({ reps: 1, source: 'estimate' })
  })
})

describe('suggestReps follows the lifter\'s own curve', () => {
  // 実データ: 60kg×10、80kg×10、90kg×1。中重量で粘れるが高重量で急に落ちるタイプ。
  const history = [
    { exercise_id: 'bench', weight_kg: 60, reps: 10 },
    { exercise_id: 'bench', weight_kg: 80, reps: 10 },
    { exercise_id: 'bench', weight_kg: 90, reps: 1 },
  ]
  it('does not promise more reps at 100kg than were managed at 90kg', () => {
    // 80kg×10 の推定1RMは106.7kgで、式だけなら100kgで3回と出てしまう
    expect(estimateRepsAt(106.7, 100)).toBe(3)
    // 90kg×1 を踏まえれば1回
    expect(suggestReps(history, 'bench', 100)).toEqual({ reps: 1, source: 'estimate' })
    expect(suggestReps(history, 'bench', 95)).toEqual({ reps: 1, source: 'estimate' })
  })
  it('interpolates between the two surrounding records', () => {
    // 80kg→10回 と 90kg→1回 の間なので、85kgは5回
    expect(suggestReps(history, 'bench', 85)).toEqual({ reps: 5, source: 'estimate' })
    // 60kg と 80kg はどちらも10回なので、その間も10回
    expect(suggestReps(history, 'bench', 70)).toEqual({ reps: 10, source: 'estimate' })
  })
  it('never suggests more reps as the weight goes up', () => {
    const weights = [62.5, 65, 70, 75, 82.5, 85, 87.5, 92.5, 95, 100, 110]
    const reps = weights.map((w) => suggestReps(history, 'bench', w)?.reps ?? 0)
    expect(reps).toEqual([...reps].sort((a, b) => b - a))
  })
  it('falls back to the formula where the curve is flat', () => {
    // 60kg と 80kg がどちらも10回だけだと傾きが取れないので、推定1RMから逆算する
    const flat = history.slice(0, 2)
    expect(suggestReps(flat, 'bench', 90)).toEqual({ reps: 6, source: 'estimate' })
  })
})
