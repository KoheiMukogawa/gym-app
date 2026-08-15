import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { HistoryPage } from './HistoryPage'
import { ToastProvider } from '../../components/ui/Toast'
import type { FeedItem } from '../feed/queries'

const { fetchUserWorkouts } = vi.hoisted(() => ({ fetchUserWorkouts: vi.fn() }))
vi.mock('./queries', () => ({ fetchUserWorkouts }))

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession }))

const USER = 'user-1'

const ITEM: FeedItem = {
  workout_id: 'w1',
  user_id: USER,
  display_name: 'たろう',
  performed_at: '2026-08-14T10:00:00Z',
  sets: [{ exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 8 }],
}

function renderHistoryPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <HistoryPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('HistoryPage error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSession.mockReturnValue({
      userId: USER,
      profile: null,
      loading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    })
  })

  // Regression: this is the same bug class Task 10's review flagged for FeedPage —
  // a failed fetch must not read as "you have never trained".
  it('shows a retryable error state instead of the empty-state message when the fetch fails', async () => {
    fetchUserWorkouts.mockRejectedValueOnce(new Error('network error'))
    renderHistoryPage()

    expect(await screen.findByRole('button', { name: '再試行' })).toBeInTheDocument()
    expect(screen.queryByText('まだ記録がありません')).not.toBeInTheDocument()
  })

  // Coverage: HistoryPage also derives the calendar's active-day marks from the
  // same fetch, so the error path must not leave a blank "0 workouts this month"
  // calendar on screen either.
  it('does not render the month calendar while the error state is shown', async () => {
    fetchUserWorkouts.mockRejectedValueOnce(new Error('network error'))
    renderHistoryPage()

    await screen.findByRole('button', { name: '再試行' })
    expect(screen.queryByText('2026年8月')).not.toBeInTheDocument()
  })

  // Regression: retry must actually recover into a normal history view, not just
  // clear the error text.
  it('retries the fetch on tap and renders the history once it succeeds', async () => {
    fetchUserWorkouts.mockRejectedValueOnce(new Error('network error'))
    fetchUserWorkouts.mockResolvedValueOnce([ITEM])
    renderHistoryPage()
    const user = userEvent.setup()

    const retryButton = await screen.findByRole('button', { name: '再試行' })
    await user.click(retryButton)

    expect(await screen.findByText('たろう')).toBeInTheDocument()
    expect(fetchUserWorkouts).toHaveBeenCalledTimes(2)
  })

  // Regression: a second failure must not wedge the page in a state with no way
  // forward (e.g. stuck on the spinner, or losing the retry control).
  it('leaves the error state and retry control in place after a second consecutive failure', async () => {
    fetchUserWorkouts.mockRejectedValue(new Error('network error'))
    renderHistoryPage()
    const user = userEvent.setup()

    const firstRetry = await screen.findByRole('button', { name: '再試行' })
    await user.click(firstRetry)

    const secondRetry = await screen.findByRole('button', { name: '再試行' })
    expect(secondRetry).toBeInTheDocument()
    expect(screen.queryByText('まだ記録がありません')).not.toBeInTheDocument()
    expect(fetchUserWorkouts).toHaveBeenCalledTimes(2)
  })

  // Coverage: fetchUserWorkouts is called with the signed-in user's id, since this
  // page must only ever show the viewer's own history.
  it('fetches workouts for the signed-in user', async () => {
    fetchUserWorkouts.mockResolvedValueOnce([])
    renderHistoryPage()

    await screen.findByText('まだ記録がありません')
    expect(fetchUserWorkouts).toHaveBeenCalledWith(USER)
  })
})
