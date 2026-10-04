import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { accountMessage, deleteMyAccount, fetchDeletionSummary } from './queries'

beforeEach(() => vi.clearAllMocks())

describe('account queries', () => {
  it('reads the deletion summary', async () => {
    const summary = { workout_days: 3, set_count: 12, body_log_count: 0, custom_exercise_count: 1, health_sync_connected: false, owned_communities: [] }
    rpc.mockResolvedValue({ data: summary, error: null })
    await expect(fetchDeletionSummary()).resolves.toEqual(summary)
    expect(rpc).toHaveBeenCalledWith('account_deletion_summary')
  })
  it('sends the typed confirmation to the deletion', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await deleteMyAccount('退会する')
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { p_confirm: '退会する' })
  })
  it('throws the RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(deleteMyAccount('退会する')).rejects.toEqual({ message: 'boom' })
  })
})

describe('accountMessage', () => {
  it('shows the database reasons as they are', () => {
    for (const message of ['ログインが必要です', '確認の文字が一致しません', 'ほかの利用者の記録が使っている種目があるため退会できません'])
      expect(accountMessage({ message })).toBe(message)
  })
  it('explains a missing function', () => {
    expect(accountMessage({ code: 'PGRST202', message: 'Could not find the function' }))
      .toBe('退会機能の準備中です。時間をおいてお試しください。')
  })
  it('falls back to the shared messages', () => {
    expect(accountMessage(new Error('boom'))).toBe('エラーが発生しました。もう一度お試しください。')
  })
})
