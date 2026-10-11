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
  weekly_active_lifters: 2, lifters_2plus_days_7d: 1, workouts_7d: 3, sets_7d: 30,
  retention: { d1: { eligible: 4, retained: 2 }, d7: { eligible: 3, retained: 1 }, d30: { eligible: 0, retained: 0 } },
  signups_by_source_90d: [{ source: 'calc-1rm', signups: 2 }, { source: 'unknown', signups: 1 }],
}
beforeEach(() => { vi.clearAllMocks(); fetchUsageStats.mockResolvedValue(stats); fetchGrowthStats.mockResolvedValue(growth) })

it('shows the totals, this week and the weekly table newest first', async () => {
  render(<UsagePage />)
  expect(await screen.findByRole('heading', { name: '利用状況' })).toBeInTheDocument()
  expect(screen.getByText(/ワークアウトを記録した日を、使った日として数えています/)).toBeInTheDocument()
  expect(within(tile('登録者数')).getByText('6')).toBeInTheDocument()
  expect(within(tile('直近7日に記録した人')).getByText('2')).toBeInTheDocument()
  expect(within(tile('直近30日に記録した人')).getByText('4')).toBeInTheDocument()
  expect(within(tile('今週のセット数')).getByText('18')).toBeInTheDocument()
  const rows = within(screen.getByRole('table', { name: '週ごとの利用状況' })).getAllByRole('row').slice(1)
  expect(rows.map((row) => row.textContent)).toEqual(['10/5〜22180', '9/28〜35401'])
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
  expect(await screen.findByText('Weekly Active Lifters')).toBeInTheDocument()
  expect(tile('Weekly Active Lifters')).toHaveTextContent('2人')
  expect(tile('WAU/MAU')).toHaveTextContent('50%')
  expect(tile('1人あたり（直近7日）')).toHaveTextContent('1.5回・15.0セット')
  expect(tile('D1リテンション')).toHaveTextContent('2/4人（50%）')
  expect(tile('D30リテンション')).toHaveTextContent('—')
  expect(screen.getByRole('row', { name: /calc-1rm/ })).toHaveTextContent('2人')

  fetchGrowthStats.mockRejectedValueOnce({ message: 'function public.admin_growth_stats() does not exist' })
  render(<UsagePage />)
  expect(await screen.findAllByRole('alert')).toHaveLength(1)
  expect(screen.getAllByRole('heading', { name: '利用状況' })).toHaveLength(2)
})
