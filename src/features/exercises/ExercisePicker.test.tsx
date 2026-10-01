import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExercisePicker } from './ExercisePicker'
import type { Exercise } from '../../lib/types'
const { saveOrder } = vi.hoisted(() => ({ saveOrder: vi.fn() }))
beforeEach(() => { saveOrder.mockReset(); saveOrder.mockResolvedValue(undefined) })
vi.mock('../routines/queries', async (original) => ({
  ...await original<typeof import('../routines/queries')>(),
  fetchExerciseOrder: async () => [], saveExerciseOrder: saveOrder,
}))

const exercise = (id: string, name: string, muscle_group: Exercise['muscle_group'], owner: string | null = null): Exercise => ({
  id, name, name_normalized: name.toLowerCase(), muscle_group,
  is_preset: !owner, created_by: owner, created_at: '2026-08-01T00:00:00Z',
})
const EXERCISES = [
  exercise('bench', 'ベンチプレス', 'chest'),
  exercise('squat', 'スクワット', 'legs'),
  exercise('decline', 'デクラインベンチプレス', 'chest'),
  exercise('own', '自分のプレス', 'chest', 'u1'),
  exercise('other', '他の人のプレス', 'chest', 'u2'),
]
function setup(onCreate = vi.fn(), recentIds: string[] = []) {
  const onSelect = vi.fn()
  render(<ExercisePicker exercises={EXERCISES} recentIds={recentIds} userId="u1" onSelect={onSelect} onCreate={onCreate} />)
  return { onSelect, onCreate, user: userEvent.setup() }
}
describe('ExercisePicker', () => {
  it('saves a keyboard reorder directly, retains failed order and retries', async () => {
    saveOrder.mockRejectedValueOnce(new Error('network'))
    const { user, onSelect } = setup()
    const handle = screen.getByRole('button', { name: '自分のプレスを長押しして並び替え' })
    await waitFor(() => expect(handle).toBeEnabled())
    await user.click(handle)
    expect(onSelect).not.toHaveBeenCalled()
    handle.focus()
    await user.keyboard('{ArrowUp}')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(saveOrder).toHaveBeenCalledWith('u1', ['own', 'bench'])
    await user.click(screen.getByRole('button', { name: '再試行' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(saveOrder).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '並び順を保存' })).not.toBeInTheDocument()
  })
  it('shows only basic and personal exercises for the selected body part, without search', async () => {
    const { user } = setup()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ベンチプレス' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^自分のプレス\s*自分の種目$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /他の人/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /デクライン/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'スクワット' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '脚' }))
    expect(screen.getByRole('button', { name: 'スクワット' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ベンチプレス' })).not.toBeInTheDocument()
  })
  it('omits recent exercises and core', async () => {
    setup(vi.fn(), ['decline'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'ベンチプレスを長押しして並び替え' })).toBeEnabled())
    expect(screen.queryByRole('region', { name: '最近使った種目' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '体幹' })).not.toBeInTheDocument()
  })
  it('adds a personal exercise within the selected group', async () => {
    const { user, onCreate } = setup(vi.fn().mockResolvedValue(undefined))
    await user.click(screen.getByRole('button', { name: '脚' }))
    await user.click(screen.getByRole('button', { name: /脚の種目を追加/ }))
    await user.type(screen.getByRole('textbox', { name: '種目名' }), '  ヒップアブダクション  ')
    await user.click(screen.getByRole('button', { name: '追加して記録' }))
    expect(onCreate).toHaveBeenCalledWith('ヒップアブダクション', 'legs')
  })
  it('keeps input and group after failure and retries', async () => {
    const create = vi.fn().mockRejectedValueOnce({ code: '23505' }).mockResolvedValueOnce(undefined)
    const { user } = setup(create)
    await user.click(screen.getByRole('button', { name: /胸の種目を追加/ }))
    await user.type(screen.getByRole('textbox', { name: '種目名' }), '新しいプレス')
    await user.click(screen.getByRole('button', { name: '追加して記録' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('同じ名前')
    expect(screen.getByRole('textbox')).toHaveValue('新しいプレス')
    await user.click(screen.getByRole('button', { name: '追加して記録' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(create).toHaveBeenCalledTimes(2)
  })
  it('reuses an existing basic exercise instead of creating a duplicate', async () => {
    const { user, onCreate, onSelect } = setup()
    await user.click(screen.getByRole('button', { name: /胸の種目を追加/ }))
    await user.type(screen.getByRole('textbox'), 'ベンチ プレス')
    await user.click(screen.getByRole('button', { name: '追加して記録' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(EXERCISES[0])
  })
  it('allows a hidden preset to become a personal addition', async () => {
    const { user, onCreate } = setup(vi.fn().mockResolvedValue(undefined))
    await user.click(screen.getByRole('button', { name: /胸の種目を追加/ }))
    await user.type(screen.getByRole('textbox'), 'デクラインベンチプレス')
    await user.click(screen.getByRole('button', { name: '追加して記録' }))
    expect(onCreate).toHaveBeenCalledWith('デクラインベンチプレス', 'chest')
  })
})
