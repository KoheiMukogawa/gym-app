import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Member } from './queries'
const { rpc, listCommunities, profile, ranking } = vi.hoisted(() => ({ rpc: vi.fn(), listCommunities: vi.fn(), profile: vi.fn(), ranking: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('./queries', async (original) => ({ ...await original<typeof import('./queries')>(), listCommunities, profile, ranking }))
import { CommunityPanel } from './CommunityPanel'

const member = (user_id: string, display_name: string, over: Partial<Member> = {}): Member => ({
  user_id, display_name, icon: 'initials', bio: '', total: 500, growth: null, dots: null, dots_opt_in: false,
  lifts: { squat: null, bench: null, deadlift: null }, points: [], ...over,
})
beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: [], error: null })
  listCommunities.mockResolvedValue([{ id: 'c1', name: '仲間', owner_id: 'me', invite_code: null }])
  profile.mockResolvedValue({ user_id: 'me', display_name: '自分', icon: 'initials', bio: '' })
})
const openGroup = async () => {
  await userEvent.click(await screen.findByRole('button', { name: '仲間' }))
}

it('shows opted-in members with unit-less DOTS and guides a member without weights', async () => {
  ranking.mockResolvedValue([
    member('me', '自分', { total: 600, dots_opt_in: true }),
    member('a', '軽量', { total: 400, dots: 375.5, dots_opt_in: true }),
    member('c', '非参加', { total: 700 }),
  ])
  render(<MemoryRouter><CommunityPanel /></MemoryRouter>)
  await openGroup()
  expect(await screen.findByText('700 kg')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(screen.getByText('375.5')).toBeInTheDocument()
  expect(screen.queryByText('非参加')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '3種目それぞれ、記録日の前後14日以内の体重が必要です' })).toHaveAttribute('href', '/body')
})

it('says nobody has joined DOTS yet instead of showing an empty list', async () => {
  ranking.mockResolvedValue([member('me', '自分')])
  render(<MemoryRouter><CommunityPanel /></MemoryRouter>)
  await openGroup()
  await screen.findByText('500 kg')
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(screen.getByText('DOTSの参加者はまだいません')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'DOTSランキングへの参加はプロフィールで設定' })).toBeInTheDocument()
})

it('keeps a ranking failure on screen with retry on the DOTS tab', async () => {
  ranking.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue([member('me', '自分', { dots: 300, dots_opt_in: true })])
  render(<MemoryRouter><CommunityPanel /></MemoryRouter>)
  await openGroup()
  await userEvent.click(screen.getByRole('button', { name: 'DOTS' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /DOTSランキングへの参加/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(await screen.findByText('300.0')).toBeInTheDocument()
})
