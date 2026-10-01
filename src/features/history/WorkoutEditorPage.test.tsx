import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WorkoutEditorPage } from './WorkoutEditorPage'
import { ToastProvider } from '../../components/ui/Toast'
import { localDate } from '../../lib/dates'

const api = vi.hoisted(() => ({
  fetchEditableWorkout: vi.fn(), findWorkoutOnDate: vi.fn(), createDatedWorkout: vi.fn(), updateWorkoutDate: vi.fn(),
  updateWorkoutSet: vi.fn(), removeWorkoutSet: vi.fn(), removeWorkout: vi.fn(),
  fetchExercises: vi.fn(), createExercise: vi.fn(), saveEditableSet: vi.fn(),
}))
vi.mock('./editorQueries', () => api)
vi.mock('../exercises/queries', () => api)
vi.mock('../routines/queries', () => ({ fetchExerciseOrder: async () => [], saveExerciseOrder: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))
const EXERCISE = { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null }
const SET = { id: 's1', workout_id: 'w1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8, created_at: '2020-01-02T12:00:00Z' }
const WORKOUT = { id: 'w1', user_id: 'u1', performed_at: '2020-01-02T12:00:00Z', workout_sets: [SET] }
function setup(path = '/history/w1') {
  render(<MemoryRouter initialEntries={[path]}><ToastProvider><Routes>
    <Route path="/history/new" element={<WorkoutEditorPage />} />
    <Route path="/history/:workoutId" element={<WorkoutEditorPage />} />
    <Route path="/history" element={<div>履歴に戻りました</div>} />
  </Routes></ToastProvider></MemoryRouter>)
  return userEvent.setup()
}
beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.fetchExercises.mockResolvedValue([EXERCISE])
  api.fetchEditableWorkout.mockResolvedValue(WORKOUT)
  api.updateWorkoutSet.mockResolvedValue(undefined)
  api.createDatedWorkout.mockResolvedValue(undefined)
  api.findWorkoutOnDate.mockResolvedValue(null)
  api.saveEditableSet.mockResolvedValue(undefined)
})
describe('WorkoutEditorPage', () => {
  it('switches directly between sets and retains each unsaved input', async () => {
    api.fetchEditableWorkout.mockResolvedValue({ ...WORKOUT, workout_sets: [SET, { ...SET, id: 's2', weight_kg: 60, set_index: 2 }] })
    const user = setup()
    await user.click(await screen.findByRole('button', { name: /80kg 8回を編集/ }))
    await user.clear(screen.getByLabelText('重量（kg）'))
    await user.type(screen.getByLabelText('重量（kg）'), '85')
    await user.click(screen.getByRole('button', { name: /60kg 8回を編集/ }))
    expect(screen.getByLabelText('重量（kg）')).toHaveValue(60)
    await user.clear(screen.getByLabelText('回数'))
    await user.type(screen.getByLabelText('回数'), '12')
    await user.click(screen.getByRole('button', { name: /80kg 8回を編集/ }))
    expect(screen.getByLabelText('重量（kg）')).toHaveValue(85)
    await user.click(screen.getByRole('button', { name: '変更を保存' }))
    await screen.findByRole('button', { name: /85kg 8回を編集/ })
    await user.click(screen.getByRole('button', { name: /60kg 8回を編集/ }))
    expect(screen.getByLabelText('回数')).toHaveValue(12)
    await user.click(screen.getByRole('button', { name: '変更を保存' }))
    await waitFor(() => expect(api.updateWorkoutSet).toHaveBeenLastCalledWith('w1', expect.objectContaining({ id: 's2', weight_kg: 60, reps: 12 })))
  })
  it('updates a past set without creating another workout', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: /80kg 8回を編集/ }))
    const weight = screen.getByRole('spinbutton', { name: '重量（kg）' })
    await user.clear(weight); await user.type(weight, '82.5')
    await user.click(screen.getByRole('button', { name: '変更を保存' }))
    await waitFor(() => expect(api.updateWorkoutSet).toHaveBeenCalledWith('w1', expect.objectContaining({ id: 's1', weight_kg: 82.5 })))
    expect(api.createDatedWorkout).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /82.5kg 8回を編集/ })).toBeInTheDocument()
  })
  it('retains input on failed save and permits retry', async () => {
    api.updateWorkoutSet.mockRejectedValueOnce(new Error('network'))
    const user = setup()
    await user.click(await screen.findByRole('button', { name: /80kg 8回を編集/ }))
    const reps = screen.getByRole('spinbutton', { name: '回数' })
    await user.clear(reps); await user.type(reps, '9')
    await user.click(screen.getByRole('button', { name: '変更を保存' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(reps).toHaveValue(9)
    await user.click(screen.getByRole('button', { name: '変更を保存' }))
    expect(await screen.findByRole('button', { name: /80kg 9回を編集/ })).toBeInTheDocument()
  })
  it('creates a backdated record only when the first set is saved and retries the same set ID', async () => {
    api.saveEditableSet.mockRejectedValueOnce(new Error('network'))
    api.fetchEditableWorkout.mockImplementation(async (_user, id) => ({ ...WORKOUT, id, performed_at: '2020-02-03T12:00:00Z', workout_sets: [{ ...SET, weight_kg: 20, reps: 10 }] }))
    const user = setup('/history/new')
    const date = await screen.findByLabelText('トレーニング日')
    await user.clear(date); await user.type(date, '2020-02-03')
    await user.click(screen.getByRole('button', { name: 'ベンチプレス' }))
    expect(api.createDatedWorkout).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'セットを追加' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'セットを追加' }))
    await screen.findByRole('button', { name: /20kg 10回を編集/ })
    expect(api.createDatedWorkout).toHaveBeenCalledTimes(1)
    expect(api.createDatedWorkout).toHaveBeenCalledWith('u1', expect.any(String), '2020-02-03')
    expect(api.saveEditableSet.mock.calls[0][1].id).toBe(api.saveEditableSet.mock.calls[1][1].id)
  })
  it('adds to the existing record for that day instead of creating a second one', async () => {
    api.findWorkoutOnDate.mockResolvedValue('w-day')
    api.fetchEditableWorkout.mockImplementation(async (_user, id) => ({ ...WORKOUT, id, performed_at: '2020-02-03T12:00:00Z', workout_sets: [{ ...SET, weight_kg: 20, reps: 10 }] }))
    const user = setup('/history/new?date=2020-02-03')
    await user.click(await screen.findByRole('button', { name: 'ベンチプレス' }))
    await user.click(screen.getByRole('button', { name: 'セットを追加' }))
    await screen.findByRole('button', { name: /20kg 10回を編集/ })
    expect(api.findWorkoutOnDate).toHaveBeenCalledWith('u1', '2020-02-03')
    expect(api.createDatedWorkout).not.toHaveBeenCalled()
    expect(api.saveEditableSet).toHaveBeenCalledWith('w-day', expect.objectContaining({ exercise_id: 'bench', set_index: 2 }))
  })
  it('does not expose editing controls for another user or missing record', async () => {
    api.fetchEditableWorkout.mockResolvedValue(null)
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('編集できません')
    expect(screen.queryByLabelText('トレーニング日')).not.toBeInTheDocument()
    expect(api.fetchEditableWorkout).toHaveBeenCalledWith('u1', 'w1')
  })
  it('saves date changes independently and preserves a failed deletion', async () => {
    api.updateWorkoutDate.mockResolvedValue('2020-02-03T12:00:00Z')
    api.removeWorkoutSet.mockRejectedValue(new Error('network'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = setup()
    const date = await screen.findByLabelText('トレーニング日')
    await user.clear(date); await user.type(date, '2020-02-03')
    await user.click(screen.getByRole('button', { name: '日付の変更を保存' }))
    await waitFor(() => expect(api.updateWorkoutDate).toHaveBeenCalledWith('u1', 'w1', '2020-02-03', WORKOUT.performed_at))
    expect(date).toHaveValue(localDate('2020-02-03T12:00:00Z'))
    await user.click(screen.getByRole('button', { name: /80kg 8回を削除/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /80kg 8回を編集/ })).toBeInTheDocument()
    confirm.mockRestore()
  })
})
