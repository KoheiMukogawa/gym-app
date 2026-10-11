import { describe, expect, it } from 'vitest'
import { localDate } from '../../lib/dates'
import { checkBest, checkStartingDate, startingTotal } from './startingBests'

describe('checkBest', () => {
  it('treats a row without weight as not entered, even with the default reps', () => {
    expect(checkBest({ weight: '', reps: '1' })).toEqual({ status: 'empty' })
    expect(checkBest({ weight: '  ', reps: '' })).toEqual({ status: 'empty' })
  })

  it('estimates 1RM with the app formula, accepting full-width digits and decimal commas', () => {
    expect(checkBest({ weight: '100', reps: '5' })).toEqual({ status: 'ok', weightKg: 100, reps: 5, e1rm: 112.5 })
    expect(checkBest({ weight: '１００，５', reps: '１' })).toEqual({ status: 'ok', weightKg: 100.5, reps: 1, e1rm: 100.5 })
  })

  it('asks for reps when only the weight is filled', () => {
    expect(checkBest({ weight: '100', reps: '' })).toEqual({ status: 'invalid', error: '重量と回数の両方を入れてください' })
  })

  it('rejects weights outside 0 < w <= 9999.9 or with more than one decimal', () => {
    const error = '重量は0より大きく9999.9kg以下、小数1桁までで入力してください'
    for (const weight of ['0', '-5', '10000', '60.25', 'abc']) {
      expect(checkBest({ weight, reps: '1' })).toEqual({ status: 'invalid', error })
    }
  })

  it('explains why more than 10 reps cannot be used, and rejects other bad reps', () => {
    expect(checkBest({ weight: '60', reps: '12' })).toEqual({
      status: 'invalid', error: '11回以上は推定の誤差が大きいため使えません。10回以下の記録を入れてください',
    })
    for (const reps of ['0', '2.5', 'x']) {
      expect(checkBest({ weight: '60', reps })).toEqual({ status: 'invalid', error: '回数は1〜10の整数で入力してください' })
    }
  })
})

describe('checkStartingDate', () => {
  it('accepts today and earlier, and rejects empty, future and malformed dates', () => {
    expect(checkStartingDate(localDate())).toBeNull()
    expect(checkStartingDate('2026-01-15')).toBeNull()
    expect(checkStartingDate('')).toBe('日付を選んでください')
    expect(checkStartingDate('2999-01-01')).toBe('今日以前の正しい日付を選んでください')
    expect(checkStartingDate('2026-02-30')).toBe('今日以前の正しい日付を選んでください')
  })
})

describe('startingTotal', () => {
  it('sums only valid rows and says how many lifts it covers', () => {
    const ok = (e1rm: number) => ({ status: 'ok' as const, weightKg: e1rm, reps: 1, e1rm })
    expect(startingTotal([ok(140), { status: 'empty' }, ok(180.5)])).toEqual({ total: 320.5, count: 2 })
    expect(startingTotal([{ status: 'empty' }, { status: 'invalid', error: 'x' }])).toBeNull()
  })
})
