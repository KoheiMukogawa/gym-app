import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { BlockedUsers } from './BlockedUsers'

const taro = { user_id: 'a', display_name: '太郎', icon: 'initials', blocked_at: '2026-11-06T00:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
})

it('lists blocked people and unblocks one', async () => {
  rpc.mockImplementation(async (name: string) => name === 'list_blocked_users' ? { data: [taro], error: null } : { data: null, error: null })
  render(<BlockedUsers />)
  expect(await screen.findByText('太郎')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '太郎のブロックを解除' }))
  expect(rpc).toHaveBeenLastCalledWith('unblock_user', { p_target: 'a' })
  expect(await screen.findByText(/ブロックした人はいません/)).toBeInTheDocument()
})

it('keeps the person and shows the reason when unblocking fails', async () => {
  rpc.mockImplementation(async (name: string) => name === 'list_blocked_users'
    ? { data: [taro], error: null } : { data: null, error: { message: 'ログインが必要です' } })
  render(<BlockedUsers />)
  await userEvent.click(await screen.findByRole('button', { name: '太郎のブロックを解除' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('ログインが必要です')
  expect(screen.getByText('太郎')).toBeInTheDocument()
})

it('shows a load failure with a retry instead of an empty list', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  render(<BlockedUsers />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText(/ブロックした人はいません/)).not.toBeInTheDocument()
  rpc.mockResolvedValueOnce({ data: [], error: null })
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(await screen.findByText(/ブロックした人はいません/)).toBeInTheDocument()
})
