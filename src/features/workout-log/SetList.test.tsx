import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetList } from './SetList'

const NAMES = { bench: 'ベンチプレス', squat: 'スクワット' }

describe('SetList', () => {
  it('shows an empty message when nothing is recorded', () => {
    render(<SetList sets={[]} exerciseNames={NAMES} status={{}} onUndo={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByText('まだ記録がありません')).toBeInTheDocument()
  })

  it('shows the newest set first', () => {
    render(
      <SetList
        sets={[
          { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 },
          { id: 's2', exercise_id: 'bench', set_index: 2, weight_kg: 82.5, reps: 6 },
        ]}
        exerciseNames={NAMES}
        status={{ s1: 'saved', s2: 'saved' }}
        onUndo={vi.fn()}
        onRetry={vi.fn()}
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
        sets={[{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        status={{ s1: 'saved' }}
        onUndo={onUndo}
        onRetry={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '直前のセットを取り消す' }))
    expect(onUndo).toHaveBeenCalled()
  })

  it('dims a pending set and shows no retry control', () => {
    render(
      <SetList
        sets={[{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        status={{ s1: 'pending' }}
        onUndo={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByRole('listitem')).toHaveClass('opacity-50')
    expect(screen.queryByText(/未保存/)).not.toBeInTheDocument()
  })

  it('shows a 未保存 badge for a failed set and retries on tap', async () => {
    const onRetry = vi.fn()
    render(
      <SetList
        sets={[{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        status={{ s1: 'failed' }}
        onUndo={vi.fn()}
        onRetry={onRetry}
      />,
    )
    const retryButton = screen.getByRole('button', { name: /未保存/ })
    expect(screen.getByRole('listitem')).not.toHaveClass('opacity-50')
    await userEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledWith('s1')
  })
})
