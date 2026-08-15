import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ExerciseDetailPage } from './ExerciseDetailPage'
import { ToastProvider } from '../../components/ui/Toast'
import type { Exercise, SetWithDate } from '../../lib/types'

const { fetchExercise, fetchExerciseSets } = vi.hoisted(() => ({
  fetchExercise: vi.fn(),
  fetchExerciseSets: vi.fn(),
}))
vi.mock('./queries', () => ({ fetchExercise, fetchExerciseSets }))

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession }))

const USER = 'user-1'
const EXERCISE_ID = 'bench'

const EXERCISE: Exercise = {
  id: EXERCISE_ID,
  name: 'ベンチプレス',
  name_normalized: 'ベンチプレス',
  muscle_group: 'chest',
  is_preset: true,
  created_by: null,
  created_at: '2026-08-01T00:00:00Z',
}

const SET: SetWithDate = {
  id: 's1',
  workout_id: 'w1',
  exercise_id: EXERCISE_ID,
  set_index: 1,
  weight_kg: 80,
  reps: 8,
  created_at: '2026-08-08T10:00:00Z',
  performed_at: '2026-08-08T10:00:00Z',
}

function renderExerciseDetailPage() {
  return render(
    <MemoryRouter initialEntries={[`/exercises/${EXERCISE_ID}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('ExerciseDetailPage error handling', () => {
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

  // Regression: this is the bug class Task 10's review flagged for FeedPage, applied
  // to this page's own not-found copy — a failed fetch must not read as "this
  // exercise doesn't exist". Against the brief's original implementation (which
  // sets exercise to null on any catch and renders 「種目が見つかりませんでした」
  // whenever exercise is null) this test would FAIL: the not-found text would be
  // on screen instead of a retry control.
  it('shows a retryable error state instead of the not-found message when the fetch fails', async () => {
    fetchExercise.mockRejectedValueOnce(new Error('network error'))
    fetchExerciseSets.mockResolvedValueOnce([])
    renderExerciseDetailPage()

    expect(await screen.findByRole('button', { name: '再試行' })).toBeInTheDocument()
    expect(screen.queryByText('種目が見つかりませんでした')).not.toBeInTheDocument()
  })

  // Regression: retry must actually recover into the normal detail view, not just
  // clear the error text. Against the brief's original implementation there is no
  // 再試行 button at all (only a toast), so this test would FAIL to even find the
  // button to click.
  it('retries the fetch on tap and renders the exercise once it succeeds', async () => {
    fetchExercise.mockRejectedValueOnce(new Error('network error'))
    fetchExerciseSets.mockResolvedValueOnce([])
    fetchExercise.mockResolvedValueOnce(EXERCISE)
    fetchExerciseSets.mockResolvedValueOnce([SET])
    renderExerciseDetailPage()
    const user = userEvent.setup()

    const retryButton = await screen.findByRole('button', { name: '再試行' })
    await user.click(retryButton)

    expect(await screen.findByRole('heading', { name: 'ベンチプレス' })).toBeInTheDocument()
    expect(fetchExercise).toHaveBeenCalledTimes(2)
    expect(fetchExerciseSets).toHaveBeenCalledTimes(2)
  })

  // Regression: a second failure must not wedge the page in a state with no way
  // forward (e.g. stuck on the spinner, or losing the retry control).
  it('leaves the error state and retry control in place after a second consecutive failure', async () => {
    fetchExercise.mockRejectedValue(new Error('network error'))
    fetchExerciseSets.mockResolvedValue([])
    renderExerciseDetailPage()
    const user = userEvent.setup()

    const firstRetry = await screen.findByRole('button', { name: '再試行' })
    await user.click(firstRetry)

    const secondRetry = await screen.findByRole('button', { name: '再試行' })
    expect(secondRetry).toBeInTheDocument()
    expect(screen.queryByText('種目が見つかりませんでした')).not.toBeInTheDocument()
    expect(fetchExercise).toHaveBeenCalledTimes(2)
  })

  // Coverage: fetchExerciseSets must be called with the signed-in user's id, since
  // this page must only ever show the viewer's own history for the exercise.
  it('fetches sets for the signed-in user and the routed exercise id', async () => {
    fetchExercise.mockResolvedValueOnce(EXERCISE)
    fetchExerciseSets.mockResolvedValueOnce([])
    renderExerciseDetailPage()

    await screen.findByRole('heading', { name: 'ベンチプレス' })
    expect(fetchExerciseSets).toHaveBeenCalledWith(EXERCISE_ID, USER)
    expect(fetchExercise).toHaveBeenCalledWith(EXERCISE_ID)
  })
})
