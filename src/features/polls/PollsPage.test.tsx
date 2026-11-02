import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PollsPage } from './PollsPage'

const { fetchPolls } = vi.hoisted(() => ({ fetchPolls: vi.fn() }))
vi.mock('./queries', async (original) => ({ ...await original<typeof import('./queries')>(), fetchPolls }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

beforeEach(() => { vi.resetAllMocks() })

describe('PollsPage', () => {
  it('lists open and closed polls', async () => {
    fetchPolls.mockResolvedValue([
      { id: 'p1', question: '受付中の質問', description: null, starts_at: '2020-01-01T00:00:00Z', ends_at: '2999-01-01T00:00:00Z', my_option: null, total_votes: null, options: [{ id: 'a', label: 'A', votes: null }] },
      { id: 'p2', question: '締め切った質問', description: null, starts_at: '2020-01-01T00:00:00Z', ends_at: '2020-02-01T00:00:00Z', my_option: null, total_votes: 2, options: [{ id: 'a', label: 'A', votes: 2 }] },
    ])
    render(<PollsPage />)
    expect(await screen.findByRole('article', { name: '受付中の質問' })).toHaveTextContent('投票する')
    expect(screen.getByRole('article', { name: '締め切った質問' })).toHaveTextContent('2人のマッチョが投票')
  })

  it('keeps a failed load on screen with a retry, not as an empty list', async () => {
    fetchPolls.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce([])
    render(<PollsPage />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('いまは投票はありません')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('いまは投票はありません')).toBeInTheDocument()
  })
})
