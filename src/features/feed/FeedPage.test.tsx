import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { FeedPage } from './FeedPage'
import { ToastProvider } from '../../components/ui/Toast'
import type { FeedItem } from './queries'

const { fetchFeed } = vi.hoisted(() => ({ fetchFeed: vi.fn() }))
vi.mock('./queries', () => ({ fetchFeed }))

const ITEM: FeedItem = {
  workout_id: 'w1',
  user_id: 'u1',
  display_name: 'たろう',
  performed_at: '2026-08-14T10:00:00Z',
  sets: [{ exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 8 }],
}

function renderFeedPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <FeedPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('FeedPage error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Regression catch: this is the bug the review flagged — a failed fetch must not
  // read to the group as "nobody has trained yet".
  it('shows a retryable error state instead of the empty-state message when the fetch fails', async () => {
    fetchFeed.mockRejectedValueOnce(new Error('network error'))
    renderFeedPage()

    expect(await screen.findByRole('button', { name: '再試行' })).toBeInTheDocument()
    expect(screen.queryByText('まだ記録がありません')).not.toBeInTheDocument()
  })

  // Regression catch: retry must actually recover into a normal feed, not just
  // clear the error text.
  it('retries the fetch on tap and renders the feed once it succeeds', async () => {
    fetchFeed.mockRejectedValueOnce(new Error('network error'))
    fetchFeed.mockResolvedValueOnce([ITEM])
    renderFeedPage()
    const user = userEvent.setup()

    const retryButton = await screen.findByRole('button', { name: '再試行' })
    await user.click(retryButton)

    expect(await screen.findByText('たろう')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledTimes(2)
  })

  // Regression catch: a second failure must not wedge the page in a state with
  // no way forward (e.g. stuck on the spinner, or losing the retry control).
  it('leaves the error state and retry control in place after a second consecutive failure', async () => {
    fetchFeed.mockRejectedValue(new Error('network error'))
    renderFeedPage()
    const user = userEvent.setup()

    const firstRetry = await screen.findByRole('button', { name: '再試行' })
    await user.click(firstRetry)

    const secondRetry = await screen.findByRole('button', { name: '再試行' })
    expect(secondRetry).toBeInTheDocument()
    expect(screen.queryByText('まだ記録がありません')).not.toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledTimes(2)
  })
})
