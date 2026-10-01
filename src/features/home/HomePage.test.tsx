import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from './HomePage'
import { invalidateMonthWorkouts } from '../history/useMonthWorkouts'
import { buildStrengthSnapshot } from '../strength/strengthSnapshot'
import type { FeedItem } from '../feed/queries'

const { fetchMonthWorkouts } = vi.hoisted(() => ({ fetchMonthWorkouts: vi.fn() }))
vi.mock('../history/queries', () => ({ fetchMonthWorkouts }))
const { fetchStrengthSnapshot, fetchStrengthGoals } = vi.hoisted(() => ({ fetchStrengthSnapshot: vi.fn(), fetchStrengthGoals: vi.fn() }))
vi.mock('../strength/queries', () => ({ fetchStrengthSnapshot, fetchStrengthGoals }))
vi.mock('../profile/bodyweightQueries', () => ({ fetchBodyweightLogs: async () => [] }))
vi.mock('../workout-log/queries', () => ({ fetchTodayWorkout: async () => null }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

const at = (day: number, hour = 10) => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), day, hour).toISOString()
}
const item = (id: string, performed_at: string): FeedItem => ({
  workout_id: id, user_id: 'u1', display_name: 'me', performed_at,
  sets: [{ exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 5 }],
})
const EXERCISES = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', muscle_group: 'legs', is_preset: true, created_by: null, created_at: '' },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null, created_at: '' },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', muscle_group: 'back', is_preset: true, created_by: null, created_at: '' },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  invalidateMonthWorkouts()
  fetchStrengthGoals.mockResolvedValue([])
})

describe('HomePage', () => {
  it('shows the record button, today\'s workout, days trained this month and BIG3 bars', async () => {
    const today = new Date().getDate()
    // On the 1st there is no earlier day this month, so only today's workout exists.
    fetchMonthWorkouts.mockResolvedValue(today > 1 ? [item('w-today', at(today)), item('w-earlier', at(today - 1, 8))] : [item('w-today', at(today))])
    const rows = ['squat', 'bench', 'deadlift'].map((exercise_id, i) => ({
      exercise_id, weight_kg: [150, 100, 180][i], reps: 1, performed_at: at(today),
    }))
    fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot([...EXERCISES], [], rows))
    render(<MemoryRouter><HomePage /></MemoryRouter>)

    expect(screen.getByRole('link', { name: /トレーニングを始める/ })).toHaveAttribute('href', '/log')
    const todaySection = screen.getByRole('region', { name: '今日のトレーニング' })
    expect(await within(todaySection).findByText('ベンチプレス')).toBeInTheDocument()
    const month = screen.getByRole('region', { name: '今月のトレーニング' })
    expect(await within(month).findByLabelText(`今月 ${today > 1 ? 2 : 1}日トレーニング`)).toBeInTheDocument()
    const big3 = screen.getByRole('region', { name: 'BIG3' })
    expect(await within(big3).findByText('430')).toBeInTheDocument()
    expect(within(big3).getByRole('link', { name: /詳しく見る/ })).toHaveAttribute('href', '/big3')
  })

  it('keeps a retryable error on screen instead of an empty month', async () => {
    fetchMonthWorkouts.mockRejectedValue(new Error('network'))
    fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot([...EXERCISES], [], []))
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const month = screen.getByRole('region', { name: '今月のトレーニング' })
    expect(await within(month).findByRole('alert')).toBeInTheDocument()
    expect(within(month).getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })
})
