import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetList } from './SetList'

const NAMES = { bench: 'ベンチプレス', squat: 'スクワット' }

describe('SetList', () => {
  it('shows an empty message when nothing is recorded', () => {
    render(
      <SetList
        sets={[]}
        exerciseNames={NAMES}
        status={{}}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        deletingId={null}
      />,
    )
    expect(screen.getByText('まだ記録がありません')).toBeInTheDocument()
  })

  it('groups sets under one exercise in ascending order', () => {
    render(
      <SetList
        sets={[
          { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 },
          { id: 's2', exercise_id: 'bench', set_index: 2, weight_kg: 82.5, reps: 6 },
        ]}
        exerciseNames={NAMES}
        status={{ s1: 'saved', s2: 'saved' }}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        deletingId={null}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1set')
    expect(screen.getAllByText(NAMES.bench)).toHaveLength(1)
    expect(items[1]).toHaveTextContent('82.5')
  })

  it('deletes the chosen set from its delete button', async () => {
    const onDelete = vi.fn()
    render(
      <SetList
        sets={[
          { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 },
          { id: 's2', exercise_id: 'bench', set_index: 2, weight_kg: 82.5, reps: 6 },
        ]}
        exerciseNames={NAMES}
        status={{ s1: 'saved', s2: 'saved' }}
        onDelete={onDelete}
        onRetry={vi.fn()}
        deletingId={null}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'ベンチプレス 1set 80kg × 8回を削除' }))
    expect(onDelete).toHaveBeenCalledWith('s1')
  })

  it('deletes a set with a long swipe to the left', async () => {
    const onDelete = vi.fn()
    render(
      <SetList
        sets={[{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        status={{ s1: 'saved' }}
        onDelete={onDelete}
        onRetry={vi.fn()}
        deletingId={null}
      />,
    )
    const content = screen.getByText('1set').parentElement!
    fireEvent.pointerDown(content, { clientX: 300, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(content, { clientX: 250, clientY: 12, pointerId: 1 })
    fireEvent.pointerMove(content, { clientX: 20, clientY: 12, pointerId: 1 })
    fireEvent.pointerUp(content, { clientX: 20, clientY: 12, pointerId: 1 })
    await act(async () => {})
    expect(onDelete).toHaveBeenCalledWith('s1')
  })

  it('does not delete on a short swipe or a vertical scroll', () => {
    const onDelete = vi.fn()
    render(
      <SetList
        sets={[{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        status={{ s1: 'saved' }}
        onDelete={onDelete}
        onRetry={vi.fn()}
        deletingId={null}
      />,
    )
    const content = screen.getByText('1set').parentElement!
    fireEvent.pointerDown(content, { clientX: 300, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(content, { clientX: 240, clientY: 12, pointerId: 1 })
    fireEvent.pointerUp(content, { clientX: 240, clientY: 12, pointerId: 1 })
    fireEvent.pointerDown(content, { clientX: 300, clientY: 10, pointerId: 2 })
    fireEvent.pointerMove(content, { clientX: 290, clientY: 200, pointerId: 2 })
    fireEvent.pointerMove(content, { clientX: 0, clientY: 220, pointerId: 2 })
    fireEvent.pointerUp(content, { clientX: 0, clientY: 220, pointerId: 2 })
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('dims a pending set and shows no retry control', () => {
    render(
      <SetList
        sets={[{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        status={{ s1: 'pending' }}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        deletingId={null}
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
        onDelete={vi.fn()}
        onRetry={onRetry}
        deletingId={null}
      />,
    )
    const retryButton = screen.getByRole('button', { name: /未保存/ })
    expect(screen.getByRole('listitem')).not.toHaveClass('opacity-50')
    await userEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledWith('s1')
  })

  it('disables deletion while another set is being deleted', () => {
    render(
      <SetList
        sets={[{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }]}
        exerciseNames={NAMES}
        status={{ s1: 'saved' }}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        deletingId="s1"
      />,
    )
    expect(screen.getByRole('button', { name: /を削除$/ })).toBeDisabled()
  })
})
