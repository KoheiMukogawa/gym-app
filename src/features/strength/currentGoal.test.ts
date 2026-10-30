import { beforeEach, expect, it, vi } from 'vitest'
import { currentGoal, goalStarts, saveCurrentGoal } from './currentGoal'
const api = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), select: vi.fn(), single: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: api.from } }))
const goal = { id: 'existing', user_id: 'u1', label: '年内', target_date: '2026-12-31', target_total_kg: 500, created_at: '2026-01-01' }
beforeEach(() => {
  vi.clearAllMocks()
  api.from.mockReturnValue(api); api.upsert.mockReturnValue(api); api.select.mockReturnValue(api)
  api.single.mockResolvedValue({ data: goal, error: null })
})
it('keeps one deterministic latest legacy goal', () => {
  const newer = { ...goal, id: 'newer', created_at: '2026-02-01' }
  expect(currentGoal([newer, goal])).toEqual(newer)
  expect(currentGoal([goal, newer])).toEqual(newer)
  expect(currentGoal([])).toBeNull()
})
it('updates the existing goal ID instead of inserting another', async () => {
  await saveCurrentGoal({ userId: 'u1', existing: goal, targetDate: '2027-01-01', targetTotalKg: 550 })
  expect(api.upsert).toHaveBeenCalledWith({ id: 'existing', user_id: 'u1', label: '年内', target_date: '2027-01-01', target_total_kg: 550,
    target_squat_kg: null, target_bench_kg: null, target_deadlift_kg: null,
    start_total_kg: null, start_squat_kg: null, start_bench_kg: null, start_deadlift_kg: null }, { onConflict: 'id' })
})
it('saves the start values with the goal', async () => {
  await saveCurrentGoal({ userId: 'u1', existing: goal, targetDate: '2027-01-01', targetTotalKg: 550,
    liftTargets: { squat: 200, bench: 140, deadlift: 210 }, starts: { total: 470.4, squat: 180, bench: 100.2, deadlift: null } })
  expect(api.upsert.mock.calls[0][0]).toMatchObject({ start_total_kg: 470.4, start_squat_kg: 180, start_bench_kg: 100.2, start_deadlift_kg: null })
})
it('takes new starts for changed targets and keeps them when only the deadline changes', () => {
  const now = { total: 480.04, squat: 185, bench: 103, deadlift: 192 }
  const targets = { total: 550, squat: 200, bench: 140, deadlift: 210 }
  // A first goal starts from today's records (rounded to one decimal).
  expect(goalStarts(null, targets, now)).toEqual({ total: 480, squat: 185, bench: 103, deadlift: 192 })
  // Unchanged targets keep their old start; a changed bench target restarts from today.
  const saved = { ...goal, target_total_kg: 550, target_squat_kg: 200, target_bench_kg: 130, target_deadlift_kg: 210,
    start_total_kg: 450, start_squat_kg: 170, start_bench_kg: 95, start_deadlift_kg: null }
  expect(goalStarts(saved, targets, now)).toEqual({ total: 450, squat: 170, bench: 103, deadlift: 192 })
  // Without a record there is no start, so the gauge measures from zero.
  expect(goalStarts(null, targets, { total: null, squat: null, bench: 0, deadlift: 192 })).toEqual({ total: null, squat: null, bench: null, deadlift: 192 })
})
it('saves the optional per-lift goals', async () => {
  await saveCurrentGoal({ userId: 'u1', existing: goal, targetDate: '2027-01-01', targetTotalKg: 550, liftTargets: { squat: 200, bench: 140.5, deadlift: null } })
  expect(api.upsert.mock.calls[0][0]).toMatchObject({ target_squat_kg: 200, target_bench_kg: 140.5, target_deadlift_kg: null })
})
it.each([0, -5, 10000, 100.12, NaN])('rejects an invalid lift goal %s before writing', async (squat) => {
  await expect(saveCurrentGoal({ userId: 'u1', existing: null, targetDate: '2027-01-01', targetTotalKg: 500, liftTargets: { squat, bench: null, deadlift: null } })).rejects.toThrow('種目別の目標')
  expect(api.from).not.toHaveBeenCalled()
})
it('uses the same first ID for failed-response retries and other devices', async () => {
  api.single.mockResolvedValueOnce({ data: null, error: { message: 'network' } })
  const input = { userId: 'u1', existing: null, targetDate: '2027-01-01', targetTotalKg: 550 }
  await expect(saveCurrentGoal(input)).rejects.toMatchObject({ message: 'network' })
  await saveCurrentGoal(input)
  expect(api.upsert.mock.calls[0][0].id).toBe('u1')
  expect(api.upsert.mock.calls[1][0].id).toBe('u1')
})
it.each([0, -1, 10000, 100.12, NaN])('rejects invalid goal %s before writing', async (targetTotalKg) => {
  await expect(saveCurrentGoal({ userId: 'u1', existing: null, targetDate: '2027-01-01', targetTotalKg })).rejects.toThrow()
  expect(api.from).not.toHaveBeenCalled()
})
it('rejects nonexistent dates', async () => {
  await expect(saveCurrentGoal({ userId: 'u1', existing: null, targetDate: '2027-02-30', targetTotalKg: 500 })).rejects.toThrow()
  expect(api.from).not.toHaveBeenCalled()
})
