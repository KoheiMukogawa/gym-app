import { beforeEach, describe, expect, it, vi } from 'vitest'
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { from, rpc } }))
import { feedbackMessage, fetchAllFeedback, fetchIsAdmin, fetchMyFeedback, fetchUnreadFeedbackCount, formatSentAt, markFeedbackRead, sendFeedback } from './queries'

// A chainable stand-in for the PostgREST builder that resolves to `result`.
function builder(result: unknown) {
  const b: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const name of ['select', 'insert', 'eq', 'order', 'limit', 'single']) b[name] = vi.fn(() => b)
  ;(b as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)) as never
  return b
}

beforeEach(() => vi.clearAllMocks())

describe('feedback queries', () => {
  it('reads my notes newest first, up to 50', async () => {
    const rows = [{ id: '1', body: 'a', created_at: '2026-10-05T00:00:00Z', read_at: null }]
    const b = builder({ data: rows, error: null }); from.mockReturnValue(b)
    await expect(fetchMyFeedback()).resolves.toEqual(rows)
    expect(from).toHaveBeenCalledWith('feedback')
    expect(b.select).toHaveBeenCalledWith('id, body, created_at, read_at')
    expect(b.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(b.limit).toHaveBeenCalledWith(50)
  })
  it('sends the trimmed text with the browser information', async () => {
    const row = { id: '1', body: '使いやすい', created_at: '2026-10-05T00:00:00Z', read_at: null }
    const b = builder({ data: row, error: null }); from.mockReturnValue(b)
    await expect(sendFeedback('  使いやすい\n')).resolves.toEqual(row)
    expect(b.insert).toHaveBeenCalledWith({ body: '使いやすい', user_agent: navigator.userAgent.slice(0, 500) })
    expect(b.single).toHaveBeenCalled()
  })
  it('throws the insert error', async () => {
    from.mockReturnValue(builder({ data: null, error: { message: 'boom' } }))
    await expect(sendFeedback('a')).rejects.toEqual({ message: 'boom' })
  })
  it('knows an admin by their own admins row', async () => {
    const b = builder({ data: [{ user_id: 'me' }], error: null }); from.mockReturnValue(b)
    await expect(fetchIsAdmin('me')).resolves.toBe(true)
    expect(from).toHaveBeenCalledWith('admins')
    expect(b.eq).toHaveBeenCalledWith('user_id', 'me')
    from.mockReturnValue(builder({ data: [], error: null }))
    await expect(fetchIsAdmin('me')).resolves.toBe(false)
  })
  it('calls the admin functions', async () => {
    rpc.mockResolvedValueOnce({ data: 3, error: null })
    await expect(fetchUnreadFeedbackCount()).resolves.toBe(3)
    expect(rpc).toHaveBeenLastCalledWith('admin_unread_feedback_count')
    rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(fetchAllFeedback()).resolves.toEqual([])
    expect(rpc).toHaveBeenLastCalledWith('admin_list_feedback')
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await markFeedbackRead('f1')
    expect(rpc).toHaveBeenLastCalledWith('admin_mark_feedback_read', { p_id: 'f1' })
    rpc.mockResolvedValueOnce({ data: null, error: { message: '権限がありません' } })
    await expect(markFeedbackRead('f1')).rejects.toEqual({ message: '権限がありません' })
  })
})

describe('feedbackMessage', () => {
  it('shows the database reasons as they are', () => {
    for (const message of ['ログインが必要です', '権限がありません', '送信の上限に達しました。時間をおいてお試しください'])
      expect(feedbackMessage({ message })).toBe(message)
  })
  it('explains a missing function or table', () => {
    for (const code of ['PGRST202', 'PGRST205'])
      expect(feedbackMessage({ code, message: 'Could not find' })).toBe('この機能の準備中です。時間をおいてお試しください。')
  })
  it('falls back to the shared messages', () => {
    expect(feedbackMessage(new Error('boom'))).toBe('エラーが発生しました。もう一度お試しください。')
  })
})

it('formats the sent time in Japan time', () => {
  expect(formatSentAt('2026-10-05T00:30:00Z')).toBe('10/5 9:30')
})
