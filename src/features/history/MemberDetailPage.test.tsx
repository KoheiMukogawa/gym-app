import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import type { FeedItem } from '../feed/queries'
import { MemberDetailPage } from './MemberDetailPage'

const { fetchUserWorkouts } = vi.hoisted(() => ({ fetchUserWorkouts: vi.fn() }))
vi.mock('./queries', () => ({ fetchUserWorkouts }))

const ITEM: FeedItem = {
  workout_id: 'w1',
  user_id: 'u1',
  display_name: 'あき',
  performed_at: '2026-08-14T10:00:00Z',
  sets: [{ exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 8 }],
}

function renderPage(state?: { displayName: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/members/u1', state }]}>
      <ToastProvider>
        <Routes>
          <Route path="/members/:userId" element={<MemberDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('MemberDetailPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches and renders the selected member workouts', async () => {
    fetchUserWorkouts.mockResolvedValueOnce([ITEM])
    renderPage()

    expect(await screen.findByText('ベンチプレス')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'あき' })).toBeInTheDocument()
    expect(fetchUserWorkouts).toHaveBeenCalledWith('u1')
  })

  it('keeps the member name in the empty state when opened from the list', async () => {
    fetchUserWorkouts.mockResolvedValueOnce([])
    renderPage({ displayName: 'あき' })

    expect(await screen.findByText('まだ記録がありません')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'あき' })).toBeInTheDocument()
  })

  it('retries without showing the empty state after a fetch failure', async () => {
    fetchUserWorkouts.mockRejectedValueOnce(new Error('network error'))
    fetchUserWorkouts.mockResolvedValueOnce([ITEM])
    renderPage()
    const user = userEvent.setup()

    const retry = await screen.findByRole('button', { name: '再試行' })
    expect(screen.queryByText('まだ記録がありません')).not.toBeInTheDocument()
    await user.click(retry)
    expect(await screen.findByText('ベンチプレス')).toBeInTheDocument()
    expect(fetchUserWorkouts).toHaveBeenCalledTimes(2)
  })
})
