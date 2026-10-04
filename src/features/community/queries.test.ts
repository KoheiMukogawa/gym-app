import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { communityMessage, formatMetric, rankMembers, saveDotsSettings, type Member } from './queries'

const member = (user_id: string, over: Partial<Member> = {}): Member => ({
  user_id, display_name: user_id, icon: 'initials', bio: '', total: null, growth: null, dots: null, dots_opt_in: false,
  lifts: { squat: null, bench: null, deadlift: null }, points: [], ...over,
})
beforeEach(() => { vi.clearAllMocks() })

it('ranks DOTS among opted-in members only, sharing ranks on ties and leaving missing scores unranked', () => {
  const rows = rankMembers([
    member('a', { dots: 400, dots_opt_in: true, total: 500 }),
    member('b', { dots: 450, dots_opt_in: true, total: 400 }),
    member('c', { dots: 400, dots_opt_in: true, total: 300 }),
    member('f', { dots: 350, dots_opt_in: true, total: 200 }),
    member('d', { dots: null, dots_opt_in: true, total: 600 }),
    member('e', { dots: null, dots_opt_in: false, total: 700 }),
  ], 'dots')
  // The rank after a tie skips the shared places (2, 2, then 4).
  expect(rows.map((r) => [r.user_id, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2], ['f', 4], ['d', null]])
})

it('keeps every member in the kg rankings', () => {
  const rows = rankMembers([member('a', { total: 500 }), member('e', { total: 700, dots_opt_in: false })], 'total')
  expect(rows.map((r) => [r.user_id, r.rank])).toEqual([['e', 1], ['a', 2]])
})

it('formats DOTS without a unit and kg metrics with one', () => {
  expect(formatMetric(375.5, 'dots')).toBe('375.5')
  expect(formatMetric(400, 'dots')).toBe('400.0')
  expect(formatMetric(760, 'total')).toBe('760 kg')
  expect(formatMetric(12.5, 'growth')).toBe('+12.5 kg')
  expect(formatMetric(null, 'dots')).toBe('—')
})

it('saves DOTS settings through the RPC and surfaces its validation message', async () => {
  rpc.mockResolvedValueOnce({ error: null })
  await saveDotsSettings(true, 'female')
  expect(rpc).toHaveBeenCalledWith('save_dots_settings', { p_opt_in: true, p_formula: 'female' })
  rpc.mockResolvedValueOnce({ error: { message: 'DOTSの係数を選んでください' } })
  const failure = await saveDotsSettings(true, null).catch((e) => e)
  expect(communityMessage(failure)).toBe('DOTSの係数を選んでください')
})
