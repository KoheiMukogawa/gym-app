import { beforeEach, expect, it, vi } from 'vitest'
import { fetchBodyweightLogs } from './bodyweightQueries'
const { from, select, eq, order, range } = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
}))
vi.mock('../../lib/supabase', () => ({ supabase: { from } }))
beforeEach(() => {
  vi.clearAllMocks()
  from.mockReturnValue({ select }); select.mockReturnValue({ eq })
  eq.mockReturnValue({ order }); order.mockReturnValue({ range })
})
const rows = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => ({
  recorded_on: String(offset + i), bodyweight_kg: '70.2', body_fat_pct: i % 2 ? '15.4' : null,
}))
it.each([0, 1000, 1001, 2100])('reads %i rows through ordered owner-scoped pages', async (count) => {
  range.mockImplementation(async (start: number) => ({ data: rows(Math.max(0, Math.min(1000, count - start)), start), error: null }))
  const result = await fetchBodyweightLogs('owner')
  expect(result).toHaveLength(count)
  expect(range.mock.calls).toEqual(Array.from({ length: Math.floor(count / 1000) + 1 }, (_, i) => [i * 1000, i * 1000 + 999]))
  expect(eq.mock.calls.every((call) => call[0] === 'user_id' && call[1] === 'owner')).toBe(true)
  expect(order.mock.calls.every((call) => call[0] === 'recorded_on' && call[1].ascending)).toBe(true)
  if (count) expect(result[0]).toEqual({ recorded_on: '0', bodyweight_kg: 70.2, body_fat_pct: null })
  if (count > 1) expect(result[1].body_fat_pct).toBe(15.4)
})
it('throws a later page error instead of returning truncated history', async () => {
  const error = { message: 'later page failed' }
  range.mockResolvedValueOnce({ data: rows(1000), error: null }).mockResolvedValueOnce({ data: null, error })
  await expect(fetchBodyweightLogs('owner')).rejects.toBe(error)
})
