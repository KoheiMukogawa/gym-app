import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { fetchSeenUntil, markAnnouncementsSeen } from './queries'

beforeEach(() => vi.clearAllMocks())

it('reads the baseline time', async () => {
  rpc.mockResolvedValue({ data: '2026-10-05T08:00:00+00:00', error: null })
  await expect(fetchSeenUntil()).resolves.toBe('2026-10-05T08:00:00+00:00')
  expect(rpc).toHaveBeenCalledWith('announcements_seen_until')
})
it.each([[null], [[]], [{}], [42]])('treats %j as no baseline', async (data) => {
  rpc.mockResolvedValue({ data, error: null })
  await expect(fetchSeenUntil()).resolves.toBeNull()
})
it('throws the RPC error', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(fetchSeenUntil()).rejects.toEqual({ message: 'boom' })
})
it('marks the announcements seen', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  await markAnnouncementsSeen()
  expect(rpc).toHaveBeenCalledWith('mark_announcements_seen')
})
