import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

  it('shows shares and the user\'s choice after voting, without counts or names', () => {
    render(<PollCard poll={{ ...POLL, my_option: 'glog', total_votes: 4,
      options: [{ id: 'glog', label: 'Glog', votes: 3 }, { id: 'barbell-club', label: 'BARBELL CLUB', votes: 1 }] }} />)
    const results = screen.getByRole('list', { name: '結果' })
    expect(results).toHaveTextContent('Glog75%あなたの投票')
    expect(results).toHaveTextContent('BARBELL CLUB25%')
    expect(results).not.toHaveTextContent(/\d票/)
    expect(screen.queryByText(/4人/)).toBeNull()
    expect(screen.queryByRole('button', { name: '投票する' })).toBeNull()
  })

  it('splits one gauge between the two options, and lists three or more as bars', () => {
    const { container, unmount } = render(<PollCard poll={{ ...POLL, my_option: 'glog', total_votes: 3,
      options: [{ id: 'glog', label: 'Glog', votes: 1 }, { id: 'barbell-club', label: 'BARBELL CLUB', votes: 2 }] }} />)
    // Shares add up to 100 even when they do not divide evenly.
    expect(screen.getByRole('list', { name: '結果' })).toHaveTextContent('Glog33%あなたの投票BARBELL CLUB67%')
    expect(container.querySelectorAll('[aria-hidden="true"].relative')).toHaveLength(1)
    unmount()
    render(<PollCard poll={{ ...POLL, my_option: 'a', total_votes: 4, options: [
      { id: 'a', label: 'A', votes: 2 }, { id: 'b', label: 'B', votes: 1 }, { id: 'c', label: 'C', votes: 1 }] }} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('list', { name: '結果' })).toHaveTextContent('Aあなたの投票50%B25%C25%')
  })

  it('keeps the shares readable inside the gauge when one side is thin', async () => {
    render(<PollCard poll={{ ...POLL, my_option: 'glog', total_votes: 10,
      options: [{ id: 'glog', label: 'Glog', votes: 1 }, { id: 'barbell-club', label: 'BARBELL CLUB', votes: 9 }] }} />)
    // The gauge starts even and is pulled to the result on the next frame.
    // The user's side (Glog, 10%) is red; its share sits on the light side, so it is drawn dark.
    await waitFor(() => expect(screen.getByText('10%', { selector: '[aria-hidden] span' })).toHaveClass('text-bg'))
    expect(screen.getByText('90%', { selector: '[aria-hidden] span' })).toHaveClass('text-bg')
    expect(document.querySelector('[aria-hidden] > div')).toHaveClass('bg-accent')
    expect(document.querySelectorAll('[aria-hidden] > div')[1]).not.toHaveClass('bg-accent')
  })

  it('turns the side the user chose red', async () => {
    render(<PollCard poll={{ ...POLL, my_option: 'barbell-club', total_votes: 4,
      options: [{ id: 'glog', label: 'Glog', votes: 1 }, { id: 'barbell-club', label: 'BARBELL CLUB', votes: 3 }] }} />)
    const [glog, club] = document.querySelectorAll('[aria-hidden] > div')
    expect(club).toHaveClass('bg-accent')
    expect(glog).not.toHaveClass('bg-accent')
    await waitFor(() => expect(screen.getByText('75%', { selector: '[aria-hidden] span' })).toHaveClass('text-white'))
    expect(screen.queryByText('あなたの投票', { selector: ':not(.sr-only)' })).toBeNull()
  })

  it('shows the results to everyone once closed', () => {
    render(<PollCard poll={{ ...POLL, ends_at: '2020-01-01T00:00:00Z', total_votes: 0, options: POLL.options.map((o) => ({ ...o, votes: 0 })) }} />)
    expect(screen.getByText('締め切りました')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '結果' })).toHaveTextContent('Glog0%')
  })

  it('shows the last minute of the period as the deadline', () => {
    render(<PollCard poll={{ ...POLL, ends_at: '2099-11-05T15:00:00Z' }} />)
    expect(screen.getByText(/受付中・11月5日\(木\) 23:59まで/)).toBeInTheDocument()
  })
})
