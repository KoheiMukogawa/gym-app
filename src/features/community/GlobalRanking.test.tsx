import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Member } from './queries'
const { rpc, profile } = vi.hoisted(() => ({ rpc: vi.fn(), profile: vi.fn() }))
vi.mock('./queries', async original => ({ ...await original<typeof import('./queries')>(), profile }))
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
beforeEach(() => { vi.clearAllMocks(); profile.mockResolvedValue({ user_id: 'me', display_name: '自分', icon: 'initials', bio: '', global_ranking: true, dots_opt_in: true }) })

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

it('lets a DOTS non-participant select a formula on the ranking page', async () => {
  profile.mockResolvedValue({ user_id: 'me', display_name: '自分', icon: 'initials', bio: '', global_ranking: true, dots_opt_in: false })
  show([member('me', '自分'), member('a', '軽量', { dots: 375.5, dots_opt_in: true })])
  await openDots()
  await userEvent.click(await screen.findByRole('button', { name: '係数を選んで参加する' }))
  expect(screen.getByRole('radio', { name: '男性用' })).toBeInTheDocument()
  expect(screen.getByText(/体重の公開に同意した人だけ表示しています/)).toBeInTheDocument()
})

it('invites a global non-participant without navigating to profile', async () => {
  profile.mockResolvedValue({ user_id: 'me', display_name: '自分', icon: 'initials', bio: '', global_ranking: false, dots_opt_in: false })
  show([member('a', '軽量', { dots: 375.5, dots_opt_in: true })])
  await userEvent.click(await screen.findByRole('button', { name: '公開して参加する' }))
  expect(screen.getByRole('form', { name: 'ランキングへの参加' })).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
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
