import { beforeEach, expect, it, vi } from 'vitest'
import { issueHealthSyncToken, fetchHealthSyncStatus, revokeHealthSyncToken } from './healthSyncQueries'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
beforeEach(() => vi.clearAllMocks())
const time = '2026-10-01T00:00:00Z'
it('uses no-argument management RPCs and returns typed results', async () => {
  rpc.mockResolvedValueOnce({ data: { token: 'a'.repeat(64), issued_at: time }, error: null })
    .mockResolvedValueOnce({ data: { enabled: true, issued_at: time, last_synced_at: time, last_synced_count: 0 }, error: null })
    .mockResolvedValueOnce({ data: null, error: null })
  expect(await issueHealthSyncToken()).toEqual({ token: 'a'.repeat(64), issued_at: time })
  expect(await fetchHealthSyncStatus()).toEqual({ enabled: true, issued_at: time, last_synced_at: time, last_synced_count: 0 })
  await revokeHealthSyncToken()
  expect(rpc.mock.calls).toEqual([['health_sync_issue_token'], ['health_sync_status'], ['health_sync_revoke_token']])
})
it.each(['issue','status','revoke'] as const)('propagates %s errors', async (name) => {
  const error = { message: 'RPC failed' }; rpc.mockResolvedValue({ data: null, error })
  await expect(({ issue: issueHealthSyncToken, status: fetchHealthSyncStatus, revoke: revokeHealthSyncToken })[name]()).rejects.toBe(error)
})
it.each([null, {}, { token:'invalid', issued_at:time }])('rejects malformed issue responses', async (data) => {
  rpc.mockResolvedValue({ data, error:null }); await expect(issueHealthSyncToken()).rejects.toThrow()
})
it.each([null, {}, { enabled:'false', issued_at:null, last_synced_at:null, last_synced_count:null },
  { enabled:true, issued_at:time, last_synced_at:time, last_synced_count:-1 }])('rejects unknown status instead of disconnected', async (data) => {
  rpc.mockResolvedValue({ data,error:null }); await expect(fetchHealthSyncStatus()).rejects.toThrow()
})
