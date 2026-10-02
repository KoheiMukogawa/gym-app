import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Member } from './queries'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
import { GlobalRanking } from './GlobalRanking'

const member = (user_id: string, display_name: string, over: Partial<Member> = {}): Member => ({
  user_id, display_name, icon: 'bolt', bio: '', total: 500, growth: null, dots: null, dots_opt_in: false,
  lifts: { squat: null, bench: null, deadlift: null }, points: [], ...over,
})
const show = (members: Member[]) => {
  rpc.mockResolvedValue({ data: members, error: null })
  render(<MemoryRouter><GlobalRanking /></MemoryRouter>)
}
const openDots = async () => {
  await screen.findByRole('list')
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
}
beforeEach(() => { vi.clearAllMocks() })

it('lists only opted-in members on the DOTS tab with unit-less scores', async () => {
  show([
    member('a', '軽量', { total: 400, dots: 375.5, dots_opt_in: true }),
    member('b', '体重なし', { total: 600, dots: null, dots_opt_in: true }),
    member('c', '非参加', { total: 700 }),
  ])
  expect(await screen.findByText('700 kg')).toBeInTheDocument()
  await openDots()
  const rows = within(screen.getByRole('list')).getAllByRole('listitem')
  expect(rows.map((r) => r.textContent)).toEqual(['1軽量375.5', '—体重なし—'])
  expect(screen.queryByText('非参加')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'DOTS' })).toHaveAttribute('aria-pressed', 'true')
})

it('points a non-participant to the profile setting', async () => {
  show([member('me', '自分'), member('a', '軽量', { dots: 375.5, dots_opt_in: true })])
  await openDots()
  expect(screen.getByRole('link', { name: 'DOTSランキングへの参加はプロフィールで設定' })).toHaveAttribute('href', '/profile')
  expect(screen.getByText(/体重の公開に同意した人だけ表示しています/)).toBeInTheDocument()
})

it('tells a user missing from the global list that both rankings must be joined', async () => {
  show([member('a', '軽量', { dots: 375.5, dots_opt_in: true })])
  await openDots()
  expect(screen.getByRole('link', { name: '全体ランキングとDOTSの両方に参加すると表示されます' })).toHaveAttribute('href', '/profile')
  expect(screen.queryByRole('link', { name: 'DOTSランキングへの参加はプロフィールで設定' })).not.toBeInTheDocument()
})

it('points a participant without a score to the body tab', async () => {
  show([member('me', '自分', { dots_opt_in: true })])
  await openDots()
  expect(screen.getByRole('link', { name: '3種目それぞれ、記録日の前後14日以内の体重が必要です' })).toHaveAttribute('href', '/body')
})

it('shows no guidance link once the participant has a score', async () => {
  show([member('me', '自分', { dots: 375.5, dots_opt_in: true })])
  await openDots()
  expect(screen.queryByRole('link', { name: /DOTSランキングへの参加/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /体重が必要です/ })).not.toBeInTheDocument()
})

it('keeps a load failure on screen with retry and never claims the user is not participating', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    .mockResolvedValue({ data: [member('me', '自分', { dots: 375.5, dots_opt_in: true })], error: null })
  render(<MemoryRouter><GlobalRanking /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /DOTSランキングへの参加/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(await screen.findByText('375.5')).toBeInTheDocument()
})
