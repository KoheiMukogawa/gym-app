import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { HistoryPage } from './HistoryPage'
import { ToastProvider } from '../../components/ui/Toast'
import type { FeedItem } from '../feed/queries'

// このテストファイルは process.env.TZ を切り替えてタイムゾーンを固定するが、
// プロジェクトの tsconfig は vite/client の型しか読み込んでいないため Node の
// グローバル型が無い。@types/node をプロジェクト全体に広げる代わりに、
// ここで使う分だけ最小限にアンビエント宣言する（persistence.test.ts と同じ手法）。
declare const process: { env: Record<string, string | undefined> }

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

// Coverage: HistoryPage derives the calendar's activeDates from each workout's
// performed_at via `new Date(...).toLocaleDateString('sv-SE')`, which formats in
// the LOCAL timezone. If that were ever "simplified" to a UTC-based derivation
// (e.g. `toISOString().slice(0, 10)`), a workout logged in the early hours of the
// local day would silently get marked on the *previous* calendar day, since its
// UTC instant is still on the previous UTC day. Task 9 shipped exactly this bug
// once for the draft date stamp, so this path gets a real test instead of a
// hand-trace.
//
// The test pins process.env.TZ to 'Asia/Tokyo' so it is deterministic regardless
// of the machine running it (this machine happens to already be JST, which would
// hide a UTC-vs-local bug if we didn't pin the zone explicitly).
//
// Math check (JST = UTC+9, no DST): local date = date-part of (UTC instant + 9h).
// Because 9h < 24h, the local date can only ever equal the UTC date or be exactly
// one day AHEAD of it — never behind. So for this timezone there is exactly one
// divergent window: UTC instants between 15:00 and 23:59, which land on local
// clock times between 00:00 and 08:59 the following day. Both cases below sit in
// that window, at its early and late edge, so together they exercise the whole
// divergent range rather than a single lucky instant.
describe('HistoryPage calendar — marks the local (JST) day, not the UTC day', () => {
  const originalTZ = process.env.TZ

  beforeEach(() => {
    // Must run before any Date is constructed in the test — process.env.TZ is
    // only honored by Node's Date/Intl machinery at construction time.
    process.env.TZ = 'Asia/Tokyo'
    vi.clearAllMocks()
    useSession.mockReturnValue({
      userId: USER,
      profile: null,
      loading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    })
  })

  afterEach(() => {
    // Not `process.env.TZ = originalTZ` — when TZ was unset beforehand,
    // `originalTZ` is `undefined`, and assigning `undefined` to a process.env
    // property coerces it to the literal string "undefined", not "unset".
    if (originalTZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = originalTZ
    }
  })

  // Edge case near the LATE edge of the divergent window: the raw stored
  // performed_at instant is late in the UTC evening (23:30 UTC on 8/13), which a
  // UTC-slicing implementation would read literally as 8/13. But it is 8/14
  // 08:30 in JST — early morning, but still the 14th — so the correct
  // (local-based) implementation must mark 8/14, not 8/13.
  it('marks 8/14 (not 8/13) for a workout at 2026-08-13T23:30:00Z (08:30 JST on 8/14)', async () => {
    const item: FeedItem = {
      ...ITEM,
      workout_id: 'w-late-utc-evening',
      performed_at: '2026-08-13T23:30:00Z',
    }
    fetchUserWorkouts.mockResolvedValueOnce([item])
    renderHistoryPage()

    expect(await screen.findByLabelText('8月14日 トレーニングあり')).toBeInTheDocument()
    expect(screen.queryByLabelText('8月13日 トレーニングあり')).not.toBeInTheDocument()
  })

  // Edge case near the EARLY edge of the divergent window: a workout logged at
  // 00:30 JST on 8/14. Its UTC instant (2026-08-13T15:30:00Z) is still on 8/13 —
  // the textbook "late-night training session" bug. A UTC-slicing implementation
  // marks 8/13; the correct implementation marks 8/14.
  it('marks 8/14 (not 8/13) for a workout at 2026-08-13T15:30:00Z (00:30 JST on 8/14)', async () => {
    const item: FeedItem = {
      ...ITEM,
      workout_id: 'w-early-local-morning',
      performed_at: '2026-08-13T15:30:00Z',
    }
    fetchUserWorkouts.mockResolvedValueOnce([item])
    renderHistoryPage()

    expect(await screen.findByLabelText('8月14日 トレーニングあり')).toBeInTheDocument()
    expect(screen.queryByLabelText('8月13日 トレーニングあり')).not.toBeInTheDocument()
  })
})
