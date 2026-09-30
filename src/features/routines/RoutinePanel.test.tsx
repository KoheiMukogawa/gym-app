import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoutinePanel } from './RoutinePanel'
import type { Exercise } from '../../lib/types'
const api = vi.hoisted(() => ({ fetchRoutines: vi.fn(), saveRoutine: vi.fn(), deleteRoutine: vi.fn() }))
vi.mock('./queries', async (original) => ({
  ...await original<typeof import('./queries')>(), ...api, fetchExerciseOrder: async () => [],
}))
const exercise: Exercise = { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null, created_at: '' }
const routine = { id: 'r1', user_id: 'u1', name: '胸の日', exercise_ids: ['bench'] }
beforeEach(() => { vi.clearAllMocks(); api.fetchRoutines.mockResolvedValue([routine]) })
function setup() {
  const onStart = vi.fn()
  render(<RoutinePanel userId="u1" exercises={[exercise]} onStart={onStart} onExerciseCreated={vi.fn()} />)
  return { user: userEvent.setup(), onStart }
}
it('preserves edits on failure and retries the same routine', async () => {
  api.saveRoutine.mockRejectedValueOnce(new Error('network')).mockImplementationOnce(async (value) => value)
  const { user, onStart } = setup()
  await user.click(await screen.findByRole('button', { name: '胸の日を編集' }))
  await user.clear(screen.getByLabelText('ルーティン名'))
  await user.type(screen.getByLabelText('ルーティン名'), '上半身')
  await user.click(screen.getByRole('button', { name: 'ルーティンを保存' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('ルーティン名')).toHaveValue('上半身')
  await user.click(screen.getByRole('button', { name: 'ルーティンを保存' }))
  await user.click(await screen.findByRole('button', { name: '上半身を開始' }))
  expect(onStart).toHaveBeenCalledWith({ ...routine, name: '上半身' })
  expect(api.saveRoutine.mock.calls[0][0].id).toBe(api.saveRoutine.mock.calls[1][0].id)
})
it('keeps a failed deletion visible and can retry', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.deleteRoutine.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
  const { user } = setup()
  await user.click(await screen.findByRole('button', { name: '胸の日を編集' }))
  await user.click(screen.getByRole('button', { name: 'ルーティンを削除' }))
  await screen.findByRole('alert')
  await user.click(screen.getByRole('button', { name: 'ルーティンを削除' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'ルーティン編集' })).not.toBeInTheDocument())
  expect(api.deleteRoutine).toHaveBeenLastCalledWith('u1', 'r1')
  expect(screen.queryByRole('button', { name: '胸の日を開始' })).not.toBeInTheDocument()
  confirm.mockRestore()
})
it('requires editing missing exercises before starting', async () => {
  api.fetchRoutines.mockResolvedValue([{ ...routine, exercise_ids: ['missing'] }])
  setup()
  expect(await screen.findByRole('button', { name: '胸の日を開始' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '胸の日を編集' })).toBeEnabled()
})
