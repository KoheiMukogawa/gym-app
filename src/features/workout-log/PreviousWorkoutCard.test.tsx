import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { PreviousWorkoutCard } from './PreviousWorkoutCard'

const { fetchPreviousWorkout } = vi.hoisted(() => ({ fetchPreviousWorkout: vi.fn() }))
vi.mock('./queries', () => ({ fetchPreviousWorkout }))

const previous = {
  performed_at: '2025-09-20T03:00:00Z',
  sets: [
    { id: 'first', exercise_id: 'bench', set_index: 1, weight_kg: 60, reps: 10, note: null },
    { id: 'last', exercise_id: 'bench', set_index: 3, weight_kg: 80, reps: 8, note: '最後は補助あり\nフォームを意識' },
  ],
}
const props = { userId: 'user-1', exerciseId: 'bench', isBodyweight: false }
beforeEach(() => { vi.clearAllMocks(); fetchPreviousWorkout.mockResolvedValue(previous) })

it('starts compact and expands all sets, retaining original numbers and multiline memos', async () => {
  render(<PreviousWorkoutCard {...props} />)
  const summary = await screen.findByText(/最終セット/)
  const details = summary.closest('details')!
  expect(details.open).toBe(false)
  expect(details.querySelector('time')).toHaveTextContent('2025/9/20')
  await userEvent.click(summary)
  expect(details.open).toBe(true)
  expect(screen.getByText('1set')).toBeVisible()
  expect(screen.getByText('3set')).toBeVisible()
  expect(screen.getByText(/最後は補助あり/)).toBeVisible()
})

it('shows a recoverable error without claiming that history is empty', async () => {
  fetchPreviousWorkout.mockRejectedValueOnce(new Error('通信エラー'))
  render(<PreviousWorkoutCard {...props} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('前回の記録を読み込めませんでした')
  expect(screen.queryByText(/記録はありません/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '再試行' }))
  await screen.findByText(/最終セット/)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('discards late results and resets expansion when selecting another exercise', async () => {
  let resolve!: (value: typeof previous) => void
  fetchPreviousWorkout.mockImplementationOnce(() => new Promise(value => { resolve = value }))
  const { rerender } = render(<PreviousWorkoutCard key="bench" {...props} />)
  fetchPreviousWorkout.mockResolvedValueOnce(null)
  rerender(<PreviousWorkoutCard key="chin" {...props} exerciseId="chin" isBodyweight />)
  await screen.findByText(/記録はありません/)
  resolve(previous)
  expect(screen.queryByText(/最終セット/)).not.toBeInTheDocument()
  rerender(<PreviousWorkoutCard key="bench" {...props} />)
  const summary = await screen.findByText(/最終セット/)
  expect(summary.closest('details')!.open).toBe(false)
})

it('displays assisted and bodyweight sets as added load, without guessing historical bodyweight', async () => {
  fetchPreviousWorkout.mockResolvedValue({ ...previous, sets: [
    { ...previous.sets[0], weight_kg: -20 }, { ...previous.sets[1], weight_kg: 0 },
  ] })
  render(<PreviousWorkoutCard {...props} isBodyweight />)
  await userEvent.click(await screen.findByText(/最終セット/))
  expect(screen.getByText('−20 kg × 10回')).toBeVisible()
  expect(screen.getAllByText(/自重 × 8回/)).toHaveLength(2)
})
