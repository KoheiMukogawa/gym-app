import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Big3Column, HomePage } from './HomePage'
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

describe('Big3Column', () => {
  const rows = ['squat', 'bench', 'deadlift'].map((exercise_id, i) => ({
    exercise_id, weight_kg: [150, 100, 180][i], reps: 1, performed_at: new Date().toISOString(),
  }))
  const goal = { id: 'g', user_id: 'u1', label: 'Big3目標', target_date: '2027-01-01', target_total_kg: 500, created_at: '' }
  const bars = () => [...document.querySelectorAll<HTMLElement>('[aria-hidden="true"].relative')]
  const fill = (bar: HTMLElement) => (bar.firstElementChild as HTMLElement).style.width

  it('fills each lift bar toward its own goal and marks the part beyond it', () => {
    render(<MemoryRouter><Big3Column snapshot={buildStrengthSnapshot([...EXERCISES], [], rows)}
      goal={{ ...goal, target_squat_kg: 200, target_bench_kg: null, target_deadlift_kg: 160 }} /></MemoryRouter>)
    const [total, squat, bench, deadlift] = bars()
    // total 430/500 and squat 150/200 have not reached their goals: no goal line or extra part.
    expect(fill(total)).toBe('86%')
    expect(fill(squat)).toBe('75%')
    expect(squat.querySelector('[data-over]')).toBeNull()
    // bench has no goal, so it is compared with the heaviest lift.
    expect(fill(bench)).toBe(`${(100 / 180) * 100}%`)
    // deadlift 180 passed its 160 goal: the bar ends at the record, with a line at the goal and a gold extra part.
    expect(fill(deadlift)).toBe(`${(160 / 180) * 100}%`)
    expect((deadlift.querySelector('[data-over]') as HTMLElement).style.width).toBe(`${(20 / 180) * 100}%`)
    expect((deadlift.querySelector('[data-goal-line]') as HTMLElement).style.left).toMatch(/^calc\(88\.88\d*% - 1px\)$/)
    // Goal numbers are not written on home.
    expect(screen.queryByText(/目標/)).toBeNull()
  })

  it('measures from the start recorded with the goal, so small gains still move the gauge', () => {
    render(<MemoryRouter><Big3Column snapshot={buildStrengthSnapshot([...EXERCISES], [], rows)}
      goal={{ ...goal, start_total_kg: 400, target_squat_kg: 160, start_squat_kg: 140, target_bench_kg: 110, start_bench_kg: 120, target_deadlift_kg: 200, start_deadlift_kg: 170 }} /></MemoryRouter>)
    const [total, squat, bench, deadlift] = bars()
    // total 430 between start 400 and goal 500 is 30%, not 86%.
    expect(fill(total)).toBe('30%')
    // squat 150 is half way from its start 140 to its goal 160.
    expect(fill(squat)).toBe('50%')
    // a start above the goal is ignored, so bench measures from zero: 100 of 110.
    expect(fill(bench)).toBe(`${(100 / 110) * 100}%`)
    // deadlift 180 between 170 and 200 is a third.
    expect(parseFloat(fill(deadlift))).toBeCloseTo(100 / 3, 5)
  })

  it('keeps comparing the lifts with each other without lift goals', () => {
    render(<MemoryRouter><Big3Column snapshot={buildStrengthSnapshot([...EXERCISES], [], rows)} goal={goal} /></MemoryRouter>)
    expect(bars().slice(1).map(fill)).toEqual([`${(150 / 180) * 100}%`, `${(100 / 180) * 100}%`, '100%'])
  })
})
