import { beforeEach, expect, it, vi } from 'vitest'
import { currentGoal, saveCurrentGoal } from './currentGoal'
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
  expect(api.upsert).toHaveBeenCalledWith({ id: 'existing', user_id: 'u1', label: '年内', target_date: '2027-01-01', target_total_kg: 550 }, { onConflict: 'id' })
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
