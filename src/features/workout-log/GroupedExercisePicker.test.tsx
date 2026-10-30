import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupedExercisePicker } from './GroupedExercisePicker'
import type { Exercise } from '../../lib/types'

const api = vi.hoisted(() => ({
  fetchExerciseOrder: vi.fn(), fetchExerciseVisibility: vi.fn(), saveExerciseOrder: vi.fn(), saveExerciseVisibility: vi.fn(),
}))
vi.mock('../routines/queries', () => api)

const exercise = (id: string, name: string, muscle_group: Exercise['muscle_group']): Exercise =>
  ({ id, name, name_normalized: name, muscle_group, is_preset: true, created_by: null, created_at: '' })
const EXERCISES = [exercise('bench', 'ベンチプレス', 'chest'), exercise('press', 'チェストプレス', 'chest'), exercise('dead', 'デッドリフト', 'back')]

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchExerciseOrder.mockResolvedValue(['dead'])
  api.fetchExerciseVisibility.mockResolvedValue({ addedIds: [], hiddenIds: [] })
  api.saveExerciseOrder.mockResolvedValue(undefined)
  api.saveExerciseVisibility.mockResolvedValue(undefined)
})

const setup = () => {
  const onSelect = vi.fn()
  render(<GroupedExercisePicker exercises={EXERCISES} userId="u1" onSelect={onSelect} onManage={vi.fn()} />)
  return { user: userEvent.setup(), onSelect }
}
const names = (group: string) => within(screen.getByRole('region', { name: `${group}の種目` }))
  .getAllByRole('button', { name: /長押しして並び替え$/ }).map((b) => b.getAttribute('aria-label')!.replace('を長押しして並び替え', ''))

it('reorders exercises within a group like the dial picker, keeping the other groups in place', async () => {
  const { user, onSelect } = setup()
  const handle = await screen.findByRole('button', { name: 'チェストプレスを長押しして並び替え' })
  await waitFor(() => expect(handle).toBeEnabled())
  expect(names('胸')).toEqual(['ベンチプレス', 'チェストプレス'])
  handle.focus()
  await user.keyboard('{ArrowUp}')
  await waitFor(() => expect(api.saveExerciseOrder).toHaveBeenCalledWith('u1', ['press', 'bench', 'dead']))
  expect(names('胸')).toEqual(['チェストプレス', 'ベンチプレス'])
  expect(onSelect).not.toHaveBeenCalled()
})

it('puts the order back and says so when saving fails', async () => {
  api.saveExerciseOrder.mockRejectedValueOnce(new Error('network'))
  const { user } = setup()
  const handle = await screen.findByRole('button', { name: 'チェストプレスを長押しして並び替え' })
  await waitFor(() => expect(handle).toBeEnabled())
  handle.focus()
  await user.keyboard('{ArrowUp}')
  expect(await screen.findByRole('alert')).toHaveTextContent('並び順を保存できませんでした')
  expect(names('胸')).toEqual(['ベンチプレス', 'チェストプレス'])
})

it('hides an exercise by swiping, as on the dial picker', async () => {
  const { user } = setup()
  await user.click(await screen.findByRole('button', { name: 'ベンチプレスを非表示にする' }))
  await waitFor(() => expect(api.saveExerciseVisibility).toHaveBeenCalledWith('u1', { addedIds: [], hiddenIds: ['bench'] }))
  expect(names('胸')).toEqual(['チェストプレス'])
})
