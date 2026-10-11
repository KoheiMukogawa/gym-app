import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { fetchGrowthStats, fetchUsageStats, formatRate, formatWeek, perPerson } from './usageQueries'

beforeEach(() => vi.clearAllMocks())

it('reads the usage stats', async () => {
  const stats = { total_users: 5, active_7d: 1, active_30d: 3, weeks: [] }
  rpc.mockResolvedValue({ data: stats, error: null })
  await expect(fetchUsageStats()).resolves.toEqual(stats)
  expect(rpc).toHaveBeenCalledWith('admin_usage_stats')
})
it('throws the RPC error', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: '権限がありません' } })
  await expect(fetchUsageStats()).rejects.toEqual({ message: '権限がありません' })
})
it('formats a week start as month/day', () => {
  expect(formatWeek('2026-10-05')).toBe('10/5')
  expect(formatWeek('2026-01-12')).toBe('1/12')
})
it('reads the growth stats and formats rates', async () => {
  rpc.mockResolvedValue({ data: { weekly_active_lifters: 1 }, error: null })
  await expect(fetchGrowthStats()).resolves.toEqual({ weekly_active_lifters: 1 })
  expect(rpc).toHaveBeenCalledWith('admin_growth_stats')
  expect(formatRate({ eligible: 3, retained: 1 })).toBe('1/3人（33%）')
  expect(formatRate({ eligible: 0, retained: 0 })).toBe('—')
  expect(perPerson(7, 2)).toBe('3.5')
  expect(perPerson(7, 0)).toBe('—')
})
