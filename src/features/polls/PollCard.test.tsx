import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PollCard } from './PollCard'
import type { Poll } from './queries'

const { votePoll } = vi.hoisted(() => ({ votePoll: vi.fn() }))
vi.mock('./queries', async (original) => ({ ...await original<typeof import('./queries')>(), votePoll }))

const POLL: Poll = {
  id: 'p1', question: 'アプリの名前はどちらがいいですか？', description: '結果を参考に運営が決めます。',
  starts_at: '2026-11-01T15:00:00Z', ends_at: '2999-11-05T15:00:00Z', my_option: null, total_votes: null,
  options: [{ id: 'glog', label: 'Glog', votes: null }, { id: 'barbell-club', label: 'BARBELL CLUB', votes: null }],
}

beforeEach(() => { vi.resetAllMocks(); votePoll.mockResolvedValue(undefined) })

describe('PollCard', () => {
  it('votes once the user picks an option and confirms it cannot be changed', async () => {
    const changed = vi.fn()
    window.addEventListener('glog-polls-changed', changed)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PollCard poll={POLL} />)
    expect(screen.queryByRole('list', { name: '結果' })).toBeNull()
    const vote = screen.getByRole('button', { name: '投票する' })
    expect(vote).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'BARBELL CLUB' }))
    await userEvent.click(vote)
    expect(confirm).toHaveBeenCalledWith('「BARBELL CLUB」に投票します。投票はあとから変えられません。')
    expect(votePoll).toHaveBeenCalledWith('p1', 'barbell-club')
    expect(await screen.findByRole('status')).toHaveTextContent('投票しました')
    expect(changed).toHaveBeenCalled()
    confirm.mockRestore()
    window.removeEventListener('glog-polls-changed', changed)
  })

  it('does nothing when the confirmation is cancelled, and shows a refused vote', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PollCard poll={POLL} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Glog' }))
    await userEvent.click(screen.getByRole('button', { name: '投票する' }))
    expect(votePoll).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    votePoll.mockRejectedValue(new Error('この投票には投票済みです'))
    await userEvent.click(screen.getByRole('button', { name: '投票する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('この投票には投票済みです')
    confirm.mockRestore()
  })

  it('shows shares, counts and the user\'s choice after voting, without names', () => {
    render(<PollCard poll={{ ...POLL, my_option: 'glog', total_votes: 4,
      options: [{ id: 'glog', label: 'Glog', votes: 3 }, { id: 'barbell-club', label: 'BARBELL CLUB', votes: 1 }] }} />)
    const results = screen.getByRole('list', { name: '結果' })
    expect(results).toHaveTextContent('Glogあなたの投票75%3票')
    expect(results).toHaveTextContent('BARBELL CLUB25%1票')
    expect(screen.getByText('4人のマッチョが投票。誰がどれを選んだかは表示しません。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '投票する' })).toBeNull()
  })

  it('shows the results to everyone once closed', () => {
    render(<PollCard poll={{ ...POLL, ends_at: '2020-01-01T00:00:00Z', total_votes: 0, options: POLL.options.map((o) => ({ ...o, votes: 0 })) }} />)
    expect(screen.getByText('締め切りました')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '結果' })).toHaveTextContent('Glog0%0票')
  })

  it('shows the last minute of the period as the deadline', () => {
    render(<PollCard poll={{ ...POLL, ends_at: '2099-11-05T15:00:00Z' }} />)
    expect(screen.getByText(/受付中・11月5日\(木\) 23:59まで/)).toBeInTheDocument()
  })
})
