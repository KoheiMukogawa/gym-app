import { describe, expect, it } from 'vitest'
import { planListSave, rowsFromPrevious, rowsFromSets, type ListRow } from './listRows'
import type { LoggedSet } from './logReducer'

const row = (id: string, weight: string, reps: string, note = ''): ListRow => ({ id, weight, reps, note })
const set = (id: string, set_index: number, weight_kg: number, reps: number): LoggedSet => ({ id, exercise_id: 'bench', set_index, weight_kg, reps })

describe('rowsFromSets', () => {
  it('lists the saved sets of the exercise in order', () => {
    const { rows } = rowsFromSets([set('b', 2, 70, 5), { ...set('x', 1, 20, 1), exercise_id: 'squat' }, { ...set('a', 1, 60, 10), note: '補助あり 最後' }], 'bench')
    expect(rows.map((r) => [r.id, r.weight, r.reps, r.note])).toEqual([['a', '60', '10', '補助あり 最後'], ['b', '70', '5', '']])
  })

  it('shows the weights in pounds', () => {
    const { rows } = rowsFromSets([set('a', 1, 100, 5)], 'bench', 'lbs')
    expect(rows[0].weight).toBe('220.5')
  })

  it('starts with one empty row, so opening an exercise saves nothing', () => {
    const { rows } = rowsFromSets([], 'bench')
    expect(rows.map((r) => [r.weight, r.reps])).toEqual([['', '']])
    expect(planListSave(rows, [], 'bench', 0).upserts).toEqual([])
  })
})

describe('rowsFromPrevious', () => {
  it('copies the previous sets as new rows', () => {
    const rows = rowsFromPrevious([set('p1', 1, 80, 8), { ...set('p2', 2, 85, 5), note: '補助あり' }])
    expect(rows.map((r) => [r.weight, r.reps, r.note])).toEqual([['80', '8', ''], ['85', '5', '補助あり']])
    expect(rows.map((r) => r.id)).not.toContain('p1')
  })
})

describe('planListSave', () => {
  it('saves new rows, skips empty rows and numbers the sets', () => {
    const plan = planListSave([row('a', '60', '10'), row('e', '', ''), row('b', '62,5', '0', ' 潰れた ')], [], 'bench', 0)
    expect(plan.sets).toEqual([set('a', 1, 60, 10), { ...set('b', 2, 62.5, 0), note: '潰れた' }])
    expect(plan.upserts).toHaveLength(2)
    expect(plan.deletes).toEqual([])
  })

  it('converts pounds to kilograms before saving', () => {
    const plan = planListSave([row('a', '220.5', '5'), row('b', '225', '3')], [set('a', 1, 100, 5)], 'bench', 0, 'lbs')
    expect(plan.sets.map((s) => s.weight_kg)).toEqual([100, 102.1])
    // 100kg shown as 220.5lbs comes back as the same 100kg, so it is not resent.
    expect(plan.upserts.map((s) => s.id)).toEqual(['b'])
  })

  it('upserts only changed sets and deletes removed ones', () => {
    const saved = [set('a', 1, 60, 10), set('b', 2, 70, 5), set('c', 3, 70, 5)]
    const plan = planListSave([row('a', '60', '10'), row('c', '72.5', '5')], saved, 'bench', 0)
    expect(plan.upserts).toEqual([set('c', 2, 72.5, 5)])
    expect(plan.deletes).toEqual(['b'])
  })

  it('keeps the saved value of a half-entered row instead of deleting it', () => {
    const plan = planListSave([row('a', '60', ''), row('b', '70', '5')], [set('a', 1, 60, 10)], 'bench', 0)
    expect(plan.incomplete).toEqual(['a'])
    expect(plan.deletes).toEqual([])
    expect(plan.sets.map((s) => s.id)).toEqual(['a', 'b'])
    expect(plan.upserts).toEqual([set('b', 2, 70, 5)])
  })

  it('reports out-of-range rows with the usual message', () => {
    const plan = planListSave([row('a', '-5', '3'), row('b', '10', '1.5')], [], 'bench', 0)
    expect(plan.invalid).toEqual({ id: 'a', message: '重量は0〜9999.9kg、小数1桁までで入力してください' })
    expect(plan.sets).toEqual([])
    expect(planListSave([row('a', '-5', '3')], [], 'bench', -60).sets).toEqual([set('a', 1, -5, 3)])
  })
})
