import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildStrengthSnapshot } from '../strength/strengthSnapshot'
import { StartingBestsCard } from './StartingBestsCard'

vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

const EXERCISES = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
]
const empty = buildStrengthSnapshot(EXERCISES, [], [])
const withBench = buildStrengthSnapshot(EXERCISES, [], [{ exercise_id: 'bench', weight_kg: 80, reps: 5, performed_at: '2026-09-01T03:00:00Z' }])
const show = (snapshot: Parameters<typeof StartingBestsCard>[0]['snapshot']) =>
  render(<MemoryRouter><StartingBestsCard snapshot={snapshot} /></MemoryRouter>)

describe('StartingBestsCard', () => {
  beforeEach(() => localStorage.clear())

  it('invites people with no BIG3 record to enter their bests', () => {
    show(empty)
    expect(screen.getByRole('heading', { name: '前のアプリから乗り換え？' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ベストを入れて始める' })).toHaveAttribute('href', '/big3/start')
  })

  it('stays hidden once any lift has a record, and while the BIG3 data is missing', () => {
    show(withBench)
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
    show(null)
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
  })

  it('never comes back for this person after closing it', async () => {
    const { unmount } = show(empty)
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
    expect(localStorage.getItem('glog:big3-start-dismissed:u1')).toBe('1')
    unmount()
    show(empty)
    expect(screen.queryByRole('heading', { name: '前のアプリから乗り換え？' })).not.toBeInTheDocument()
  })
})
