import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { fetchUsageStats, fetchGrowthStats } = vi.hoisted(() => ({ fetchUsageStats: vi.fn(), fetchGrowthStats: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./usageQueries', async (original) => ({ ...await original<typeof import('./usageQueries')>(), fetchUsageStats, fetchGrowthStats }))
import { UsagePage } from './UsagePage'

const week = (week_start: string, active_users = 0, workouts = 0, sets = 0, signups = 0) => ({ week_start, active_users, workouts, sets, signups })
const stats = {
  total_users: 6, active_7d: 2, active_30d: 4,
  weeks: [week('2026-09-28', 3, 5, 40, 1), week('2026-10-05', 2, 2, 18, 0)],
}
const tile = (label: string) => screen.getByText(label).closest('div')!
const growth = {
  weekly_active_lifters: 2, previous_weekly_active_lifters: 1,
  lifters_2plus_days_7d: 1, previous_lifters_2plus_days_7d: 0,
  workouts_7d: 3, previous_workouts_7d: 1, sets_7d: 30, previous_sets_7d: 5,
  signups_7d: 1, previous_signups_7d: 0,
  activation: { registered: 6, first_workout: 4, second_workout_day: 3 },
  retention: { d1: { eligible: 4, retained: 2 }, d7: { eligible: 3, retained: 1 }, d30: { eligible: 0, retained: 0 } },
  signups_by_source_90d: [{ source: 'calc-1rm', signups: 2 }, { source: 'unknown', signups: 1 }],
}
beforeEach(() => { vi.clearAllMocks(); fetchUsageStats.mockResolvedValue(stats); fetchGrowthStats.mockResolvedValue(growth) })

it('shows the recent comparison and weekly details newest first', async () => {
  render(<UsagePage />)
  expect(await screen.findByRole('heading', { name: '利用状況' })).toBeInTheDocument()
  expect(screen.getByText(/ワークアウトを記録した日を、使った日として数えています/)).toBeInTheDocument()
  expect(await screen.findByText('直近7日間')).toBeInTheDocument()
  expect(tile('記録した人')).toHaveTextContent('2人')
  expect(tile('記録した人')).toHaveTextContent('前の7日間より+1')
  expect(tile('セット数')).toHaveTextContent('30セット')
  const weeks = within(screen.getByRole('heading', { name: '週ごとの詳細' }).parentElement!).getAllByRole('article')
  expect(weeks.map((row) => row.textContent)).toEqual(['10/5〜利用者2人記録2回セット18登録0人', '9/28〜利用者3人記録5回セット40登録1人'])
})

it('shows the error with a retry', async () => {
  fetchUsageStats.mockRejectedValueOnce({ message: '権限がありません' })
  render(<UsagePage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('権限がありません')
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(await screen.findByRole('heading', { name: '利用状況' })).toBeInTheDocument()
})

it('shows the growth metrics, and keeps the rest when they fail', async () => {
  render(<UsagePage />)
  expect(await screen.findByText('記録を始め、続けた人')).toBeInTheDocument()
  expect(screen.getByText('初回記録').closest('li')).toHaveTextContent('4人')
  expect(screen.getByText('別日に2回目').closest('li')).toHaveTextContent('3人')
  expect(screen.getByText('翌日').closest('div')).toHaveTextContent('2/4人（50%）')
  expect(screen.getByText('30〜36日目').closest('div')).toHaveTextContent('—')
  expect(screen.getByRole('row', { name: /1RM計算/ })).toHaveTextContent('2人')

  fetchGrowthStats.mockRejectedValueOnce({ message: 'function public.admin_growth_stats() does not exist' })
  render(<UsagePage />)
  expect(await screen.findAllByRole('alert')).toHaveLength(1)
  expect(screen.getAllByRole('heading', { name: '利用状況' })).toHaveLength(2)
})
