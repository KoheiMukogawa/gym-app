import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetList } from './SetList'

const NAMES = { bench: 'ベンチプレス', squat: 'スクワット' }

describe('SetList', () => {
  it('shows an empty message when nothing is recorded', () => {
    render(<SetList sets={[]} exerciseNames={NAMES} onUndo={vi.fn()} />)
    expect(screen.getByText('まだ記録がありません')).toBeInTheDocument()
  })

  it('shows the newest set first', () => {
    render(
      <SetList
        sets={[
          { exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 },
          { exercise_id: 'bench', set_index: 2, weight_kg: 82.5, reps: 6 },
        ]}
        exerciseNames={NAMES}
        onUndo={vi.fn()}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('2セット目')
    expect(items[0]).toHaveTextContent('82.5')
  })

  it('calls onUndo when the undo button is pressed', async () => {
    const onUndo = vi.fn()
    render(
      <SetList
        sets={[{ exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        onUndo={onUndo}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '直前のセットを取り消す' }))
    expect(onUndo).toHaveBeenCalled()
  })
})
