import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExercisePicker } from './ExercisePicker'
import type { Exercise } from '../../lib/types'
const { saveOrder, saveVisibility, fetchVisibility } = vi.hoisted(() => ({ saveOrder: vi.fn(), saveVisibility: vi.fn(), fetchVisibility: vi.fn() }))
beforeEach(() => {
  saveOrder.mockReset(); saveOrder.mockResolvedValue(undefined)
  saveVisibility.mockReset(); saveVisibility.mockResolvedValue(undefined)
  fetchVisibility.mockReset(); fetchVisibility.mockResolvedValue({ addedIds: [], hiddenIds: [] })
})
vi.mock('../routines/queries', () => ({
  fetchExerciseOrder: async () => [], saveExerciseOrder: saveOrder,
  fetchExerciseVisibility: fetchVisibility, saveExerciseVisibility: saveVisibility,
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
  exercise('roller', 'アブローラー', 'core'),
  exercise('abdominal', 'アブドミナル', 'core'),
  exercise('plank', 'プランク', 'core'),
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
    const handle = await screen.findByRole('button', { name: '自分のプレスを長押しして並び替え' })
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
    expect(await screen.findByRole('button', { name: 'ベンチプレス' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^自分のプレス\s*自分の種目$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /他の人/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /デクライン/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'スクワット' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '脚' }))
    expect(screen.getByRole('button', { name: 'スクワット' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ベンチプレス' })).not.toBeInTheDocument()
  })
  it('offers the abdominal machine and ab roller under abs', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '腹筋' }))
    const names = (await within(screen.getByRole('region', { name: '腹筋の種目' })).findAllByRole('button', { name: /^アブ(ドミナル|ローラー)$/ })).map((b) => b.textContent)
    expect(names).toEqual(['アブドミナル', 'アブローラー'])
    expect(screen.queryByRole('button', { name: 'プランク' })).not.toBeInTheDocument()
  })
  it('omits recent exercises', async () => {
    setup(vi.fn(), ['decline'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'ベンチプレスを長押しして並び替え' })).toBeEnabled())
    expect(screen.queryByRole('region', { name: '最近使った種目' })).not.toBeInTheDocument()
  })
  it('adds a personal exercise within the selected group', async () => {
    const { user, onCreate } = setup(vi.fn().mockResolvedValue(undefined))
    await user.click(screen.getByRole('button', { name: '脚' }))
    await user.click(await screen.findByRole('button', { name: /脚の種目を追加/ }))
    await user.click(screen.getByRole('button', { name: /リストにない種目を入力/ }))
    await user.type(screen.getByRole('textbox', { name: '種目名' }), '  ヒップアブダクション  ')
    await user.click(screen.getByRole('button', { name: '追加して記録' }))
    expect(onCreate).toHaveBeenCalledWith('ヒップアブダクション', 'legs')
  })
  it('keeps input and group after failure and retries', async () => {
    const create = vi.fn().mockRejectedValueOnce({ code: '23505' }).mockResolvedValueOnce(undefined)
    const { user } = setup(create)
    await user.click(await screen.findByRole('button', { name: /胸の種目を追加/ }))
    await user.click(screen.getByRole('button', { name: /リストにない種目を入力/ }))
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
    await user.click(await screen.findByRole('button', { name: /胸の種目を追加/ }))
    await user.click(screen.getByRole('button', { name: /リストにない種目を入力/ }))
    await user.type(screen.getByRole('textbox'), 'ベンチ プレス')
    await user.click(screen.getByRole('button', { name: '追加して記録' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(EXERCISES[0])
  })
  it('adds a preset from the catalog and keeps it visible', async () => {
    const { user, onCreate } = setup()
    await user.click(await screen.findByRole('button', { name: /胸の種目を追加/ }))
    await user.click(await screen.findByRole('button', { name: /デクラインベンチプレス.*追加する/ }))
    expect(saveVisibility).toHaveBeenCalledWith('u1', { addedIds: ['decline'], hiddenIds: [] })
    await waitFor(() => expect(screen.getByRole('button', { name: '完了' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '完了' }))
    expect(screen.getByRole('button', { name: 'デクラインベンチプレス' })).toBeInTheDocument()
    expect(onCreate).not.toHaveBeenCalled()
  })
  it('hides a basic exercise without deleting records and restores it', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /胸の種目を追加/ }))
    await user.click(await screen.findByRole('button', { name: /^ベンチプレス\s*表示中$/ }))
    expect(saveVisibility).toHaveBeenCalledWith('u1', { addedIds: [], hiddenIds: ['bench'] })
    await waitFor(() => expect(screen.getByRole('button', { name: '完了' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '完了' }))
    expect(screen.queryByRole('button', { name: 'ベンチプレス' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /胸の種目を追加/ }))
    await user.click(screen.getByRole('button', { name: /^ベンチプレス\s*追加する$/ }))
    expect(saveVisibility).toHaveBeenLastCalledWith('u1', { addedIds: [], hiddenIds: [] })
  })
  it('hides an exercise with a long left swipe and restores it from management', async () => {
    const { user, onSelect } = setup()
    const item = await screen.findByRole('button', { name: /^自分のプレス\s*自分の種目$/ })
    await waitFor(() => expect(screen.getByRole('button', { name: '自分のプレスを長押しして並び替え' })).toBeEnabled())
    const content = item.parentElement!
    fireEvent.pointerDown(content, { clientX: 300, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(content, { clientX: 240, clientY: 12, pointerId: 1 })
    fireEvent.pointerMove(content, { clientX: 20, clientY: 12, pointerId: 1 })
    fireEvent.pointerUp(content, { clientX: 20, clientY: 12, pointerId: 1 })
    expect(saveVisibility).toHaveBeenCalledWith('u1', { addedIds: [], hiddenIds: ['own'] })
    expect(onSelect).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('button', { name: /^自分のプレス\s*自分の種目$/ })).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /胸の種目を追加/ }))
    await user.click(screen.getByRole('button', { name: /^自分のプレス\s*追加する$/ }))
    expect(saveVisibility).toHaveBeenLastCalledWith('u1', { addedIds: [], hiddenIds: [] })
  })
  it('does not hide on a short swipe, a vertical scroll, or a drag from the reorder handle', async () => {
    const { onSelect } = setup()
    const item = await screen.findByRole('button', { name: 'ベンチプレス' })
    const content = item.parentElement!
    fireEvent.pointerDown(content, { clientX: 300, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(content, { clientX: 240, clientY: 12, pointerId: 1 })
    fireEvent.pointerUp(content, { clientX: 240, clientY: 12, pointerId: 1 })
    fireEvent.pointerDown(content, { clientX: 300, clientY: 10, pointerId: 2 })
    fireEvent.pointerMove(content, { clientX: 280, clientY: 150, pointerId: 2 })
    fireEvent.pointerMove(content, { clientX: 0, clientY: 160, pointerId: 2 })
    fireEvent.pointerUp(content, { clientX: 0, clientY: 160, pointerId: 2 })
    const handle = screen.getByRole('button', { name: 'ベンチプレスを長押しして並び替え' })
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 10, pointerId: 3 })
    fireEvent.pointerMove(handle, { clientX: 0, clientY: 12, pointerId: 3 })
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 12, pointerId: 3 })
    expect(saveVisibility).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })
  it('keeps the list item when hiding fails so the action can be retried', async () => {
    saveVisibility.mockRejectedValueOnce(new Error('network'))
    const { user } = setup()
    const hide = await screen.findByRole('button', { name: 'ベンチプレスを非表示にする' })
    await user.click(hide)
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました')
    expect(hide).toBeInTheDocument()
    await user.click(hide)
    await waitFor(() => expect(hide).not.toBeInTheDocument())
    expect(saveVisibility).toHaveBeenCalledTimes(2)
  })
  it('loads saved additions and hidden exercises', async () => {
    fetchVisibility.mockResolvedValue({ addedIds: ['decline'], hiddenIds: ['bench'] })
    setup()
    await waitFor(() => expect(screen.getByRole('button', { name: 'デクラインベンチプレス' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'ベンチプレス' })).not.toBeInTheDocument()
  })
  it('keeps a candidate unselected when saving fails and allows retry', async () => {
    saveVisibility.mockRejectedValueOnce(new Error('network'))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /胸の種目を追加/ }))
    await user.click(await screen.findByRole('button', { name: /デクラインベンチプレス.*追加する/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました')
    await user.click(screen.getByRole('button', { name: /デクラインベンチプレス.*追加する/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /デクラインベンチプレス.*表示中/ })).toBeInTheDocument())
  })
})
