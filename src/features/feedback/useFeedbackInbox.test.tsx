import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const { fetchIsAdmin, fetchUnreadFeedbackCount } = vi.hoisted(() => ({ fetchIsAdmin: vi.fn(), fetchUnreadFeedbackCount: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('./queries', () => ({ fetchIsAdmin, fetchUnreadFeedbackCount }))
import { notifyFeedbackRead, useFeedbackInbox } from './useFeedbackInbox'

function Probe() {
  const unread = useFeedbackInbox()
  return <p>{unread === null ? 'none' : `unread ${unread}`}</p>
}
const flush = () => act(async () => {})
beforeEach(() => vi.clearAllMocks())

it('is null for users and does not ask for the count', async () => {
  fetchIsAdmin.mockResolvedValue(false)
  render(<Probe />); await flush()
  expect(screen.getByText('none')).toBeInTheDocument()
  expect(fetchIsAdmin).toHaveBeenCalledWith('me')
  expect(fetchUnreadFeedbackCount).not.toHaveBeenCalled()
})

it('is null when the check fails', async () => {
  fetchIsAdmin.mockRejectedValue(new Error('offline'))
  render(<Probe />); await flush()
  expect(screen.getByText('none')).toBeInTheDocument()
})

it('refreshes the count after a note is marked read and when the app comes back', async () => {
  fetchIsAdmin.mockResolvedValue(true)
  fetchUnreadFeedbackCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(0)
  render(<Probe />); await flush()
  expect(screen.getByText('unread 2')).toBeInTheDocument()
  act(() => notifyFeedbackRead()); await flush()
  expect(screen.getByText('unread 1')).toBeInTheDocument()
  act(() => { document.dispatchEvent(new Event('visibilitychange')) }); await flush()
  expect(screen.getByText('unread 0')).toBeInTheDocument()
})

it('keeps the last count when a refresh fails', async () => {
  fetchIsAdmin.mockResolvedValue(true)
  fetchUnreadFeedbackCount.mockResolvedValueOnce(2).mockRejectedValueOnce(new Error('offline'))
  render(<Probe />); await flush()
  act(() => notifyFeedbackRead()); await flush()
  expect(screen.getByText('unread 2')).toBeInTheDocument()
})
