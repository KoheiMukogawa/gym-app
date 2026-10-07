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
  it('does not offer the starting bests while the BIG3 data failed to load', async () => {
    fetchMonthWorkouts.mockResolvedValue([])
    fetchStrengthSnapshot.mockRejectedValue(new Error('network'))
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    // toMessage shows a generic message for an unexpected Error.
    expect(await screen.findByText('エラーが発生しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
  })

  it('offers the starting bests to someone with no BIG3 record', async () => {
    localStorage.clear()
    fetchMonthWorkouts.mockResolvedValue([])
    fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot([...EXERCISES], [], []))
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: '前のアプリから乗り換え？' })).toBeInTheDocument()
  })

  it('shows the calendar with BIG3 beside it, the add button and today\'s sets numbered with RM', async () => {
    const today = new Date().getDate()
    // On the 1st there is no earlier day this month, so only today's workout exists.
    fetchMonthWorkouts.mockResolvedValue(today > 1 ? [item('w-today', at(today)), item('w-earlier', at(today - 1, 8))] : [item('w-today', at(today))])
    const rows = ['squat', 'bench', 'deadlift'].map((exercise_id, i) => ({
      exercise_id, weight_kg: [150, 100, 180][i], reps: 1, performed_at: at(today),
    }))
    fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot([...EXERCISES], [], rows))
    render(<MemoryRouter><HomePage /></MemoryRouter>)

    expect(screen.getByRole('link', { name: /記録する/ })).toHaveAttribute('href', '/log')
    const todaySection = screen.getByRole('region', { name: '今日のトレーニング' })
    expect(await within(todaySection).findByText('ベンチプレス')).toBeInTheDocument()
    // 80 kg × 5 → Brzycki 80 × 36 / 32 = 90
    expect(within(todaySection).getByText('90')).toBeInTheDocument()
    expect(within(todaySection).getByRole('listitem')).toHaveTextContent('80.0 kg× 5 reps')
    expect(within(todaySection).getByRole('link', { name: '今日の記録を編集' })).toHaveAttribute('href', '/history/w-today')
    expect(within(todaySection).getByRole('link', { name: 'ベンチプレス' })).toHaveAttribute('href', '/exercises/bench')
    expect(todaySection.querySelector('a a')).toBeNull()
    const month = screen.getByRole('region', { name: '今月のトレーニング' })
    const trained = await within(month).findAllByRole('button', { name: /トレーニングあり/ })
    expect(trained).toHaveLength(today > 1 ? 2 : 1)
    const big3 = screen.getByRole('region', { name: 'BIG3' })
    expect(await within(big3).findByText('430')).toBeInTheDocument()
    expect(within(big3).getByRole('link', { name: 'BIG3の詳細へ' })).toHaveAttribute('href', '/big3')
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
