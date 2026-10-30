import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { communityMessage, formatMetric, rankMembers, saveDotsSettings, saveProfile, type Member } from './queries'

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

it('ranks one lift only under the kg total, leaving members without that lift unranked', () => {
  const lifts = (squat: number | null, bench: number | null) => ({ squat, bench, deadlift: null })
  const members = [member('a', { total: 500, lifts: lifts(200, 100) }), member('b', { lifts: lifts(null, 120) }), member('c', { total: 400, lifts: lifts(150, 120) })]
  expect(rankMembers(members, 'total', 'bench').map((r) => [r.user_id, r.rank, r.value])).toEqual([['b', 1, 120], ['c', 1, 120], ['a', 3, 100]])
  expect(rankMembers(members, 'total', 'squat').map((r) => [r.user_id, r.rank])).toEqual([['a', 1], ['c', 2], ['b', null]])
  expect(rankMembers(members, 'growth', 'squat').map((r) => r.value)).toEqual([null, null, null])
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

describe('saveProfile', () => {
  it('keeps a photo icon instead of resetting it to the default', async () => {
    rpc.mockResolvedValue({ error: null })
    const photo = 'photo:u1/00000000-0000-4000-8000-000000000001.webp'
    await saveProfile({ user_id: 'u1', display_name: ' 名前 ', icon: photo, bio: '', global_ranking: true })
    expect(rpc).toHaveBeenLastCalledWith('save_glog_profile', { p_name: '名前', p_icon: photo, p_bio: '', p_global: true })
    await saveProfile({ user_id: 'u1', display_name: '名前', icon: '💪', bio: '', global_ranking: false })
    expect(rpc).toHaveBeenLastCalledWith('save_glog_profile', expect.objectContaining({ p_icon: 'muscle' }))
  })
})
