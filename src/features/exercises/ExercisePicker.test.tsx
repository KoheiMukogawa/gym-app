import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExercisePicker } from './ExercisePicker'
import type { Exercise } from '../../lib/types'

const exercise = (id: string, name: string, group: Exercise['muscle_group']): Exercise => ({
  id,
  name,
  name_normalized: name.toLowerCase(),
  muscle_group: group,
  is_preset: true,
  created_by: null,
  created_at: '2026-08-01T00:00:00Z',
})

const EXERCISES = [
  exercise('bench', 'ベンチプレス', 'chest'),
  exercise('squat', 'スクワット', 'legs'),
  exercise('curl', 'ダンベルカール', 'arms'),
]

describe('ExercisePicker', () => {
  it('lists every exercise', () => {
    render(
      <ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={vi.fn()} onCreate={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /ベンチプレス/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /スクワット/ })).toBeInTheDocument()
  })

  it('shows recently used exercises in their own section', () => {
    render(
      <ExercisePicker
        exercises={EXERCISES}
        recentIds={['squat']}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />,
    )
    expect(screen.getByText('最近使った種目')).toBeInTheDocument()
  })

  it('filters by the search term', async () => {
    render(
      <ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={vi.fn()} onCreate={vi.fn()} />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: '種目を検索' }), 'ベンチ')

    expect(screen.getByRole('button', { name: /ベンチプレス/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /スクワット/ })).not.toBeInTheDocument()
  })

  it('ignores spaces and case when filtering', async () => {
    render(
      <ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={vi.fn()} onCreate={vi.fn()} />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: '種目を検索' }), 'ベンチ プレス')
    expect(screen.getByRole('button', { name: /ベンチプレス/ })).toBeInTheDocument()
  })

  it('calls onSelect with the chosen exercise', async () => {
    const onSelect = vi.fn()
    render(
      <ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={onSelect} onCreate={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /ベンチプレス/ }))
    expect(onSelect).toHaveBeenCalledWith(EXERCISES[0])
  })

  it('offers to create a new exercise when nothing matches', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      <ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={vi.fn()} onCreate={onCreate} />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: '種目を検索' }), 'ヒップアブダクション')
    await userEvent.click(screen.getByRole('button', { name: '「ヒップアブダクション」を追加' }))
    await userEvent.click(screen.getByRole('button', { name: '脚' }))
    await userEvent.click(screen.getByRole('button', { name: '追加する' }))

    expect(onCreate).toHaveBeenCalledWith('ヒップアブダクション', 'legs')
  })

  it('does not render a recent exercise twice when it also matches the current view', () => {
    render(
      <ExercisePicker
        exercises={EXERCISES}
        recentIds={['squat']}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /スクワット/ })).toBeInTheDocument()
  })

  it('shows an inline error and keeps the create screen when onCreate rejects', async () => {
    const onCreate = vi.fn().mockRejectedValue({ code: '23505' })
    render(
      <ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={vi.fn()} onCreate={onCreate} />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: '種目を検索' }), 'ヒップアブダクション')
    await userEvent.click(screen.getByRole('button', { name: '「ヒップアブダクション」を追加' }))
    await userEvent.click(screen.getByRole('button', { name: '脚' }))
    await userEvent.click(screen.getByRole('button', { name: '追加する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '同じ名前の種目がすでに登録されています。',
    )
    expect(screen.getByText('「ヒップアブダクション」を追加')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '追加する' })).toBeEnabled()
  })

  it('clears a previous error once a retry succeeds', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce(undefined)
    render(
      <ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={vi.fn()} onCreate={onCreate} />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: '種目を検索' }), 'ヒップアブダクション')
    await userEvent.click(screen.getByRole('button', { name: '「ヒップアブダクション」を追加' }))
    await userEvent.click(screen.getByRole('button', { name: '脚' }))
    await userEvent.click(screen.getByRole('button', { name: '追加する' }))
    await screen.findByRole('alert')

    await userEvent.click(screen.getByRole('button', { name: '追加する' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
