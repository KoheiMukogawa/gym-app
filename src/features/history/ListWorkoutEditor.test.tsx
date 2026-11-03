import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WorkoutEditorPage } from './WorkoutEditorPage'
import { ToastProvider } from '../../components/ui/Toast'
import { saveInputMode } from '../workout-log/inputMode'

const api = vi.hoisted(() => ({
  fetchEditableWorkout: vi.fn(), findWorkoutOnDate: vi.fn(), createDatedWorkout: vi.fn(),
  updateWorkoutSet: vi.fn(), removeWorkoutSet: vi.fn(), removeWorkout: vi.fn(),
  fetchExercises: vi.fn(), createExercise: vi.fn(), saveEditableSet: vi.fn(), deleteWorkoutIfEmpty: vi.fn(),
}))
vi.mock('./editorQueries', () => api)
vi.mock('../exercises/queries', () => api)
vi.mock('../workout-log/queries', () => api)
vi.mock('../routines/queries', () => ({
  cachedExerciseOrder: () => undefined, cachedExerciseVisibility: () => undefined,
  fetchExerciseOrder: async () => [], saveExerciseOrder: vi.fn(),
  fetchExerciseVisibility: async () => ({ addedIds: [], hiddenIds: [] }), saveExerciseVisibility: vi.fn(),
}))
vi.mock('../profile/bodyweightQueries', () => ({ fetchBodyweightLogs: async () => [] }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))
const EXERCISE = { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null }
const SET = { id: 's1', workout_id: 'w1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8, note: null, created_at: '2020-01-02T12:00:00Z' }
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
  saveInputMode('u1', 'list')
  api.fetchExercises.mockResolvedValue([EXERCISE])
  api.fetchEditableWorkout.mockResolvedValue(WORKOUT)
  api.createDatedWorkout.mockResolvedValue(undefined)
  api.findWorkoutOnDate.mockResolvedValue(null)
  api.saveEditableSet.mockResolvedValue(undefined)
  api.removeWorkoutSet.mockResolvedValue(undefined)
  api.deleteWorkoutIfEmpty.mockResolvedValue(true)
})

describe('WorkoutEditorPage in list input mode', () => {
  it('edits the day\'s sets as table rows and saves changes when going back', async () => {
    const user = setup()
    expect(await screen.findByRole('heading', { name: '2020年1月2日' })).toBeVisible()
    const weight = screen.getByLabelText('1セット目の重さ')
    expect(weight).toHaveValue('80')
    expect(screen.queryByLabelText('重量（kg）')).toBeNull()
    await user.clear(weight)
    await user.type(weight, '82.5')
    await user.click(screen.getByRole('button', { name: '保存して履歴に戻る' }))
    expect(await screen.findByText('履歴に戻りました')).toBeInTheDocument()
    expect(api.saveEditableSet).toHaveBeenCalledTimes(1)
    expect(api.saveEditableSet).toHaveBeenCalledWith('w1', expect.objectContaining({ id: 's1', weight_kg: 82.5, reps: 8, set_index: 1 }), 0)
  })

  it('saves the finished row when the next set is added', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'ベンチプレスにセットを追加' }))
    expect(api.saveEditableSet).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('2セット目の重さ'), '85')
    await user.type(screen.getByLabelText('2セット目の回数'), '5')
    await user.click(screen.getByRole('button', { name: 'ベンチプレスにセットを追加' }))
    await waitFor(() => expect(api.saveEditableSet).toHaveBeenCalledWith('w1', expect.objectContaining({ weight_kg: 85, reps: 5, set_index: 2 }), 0))
    expect(await screen.findByLabelText('3セット目の重さ')).toHaveValue('')
  })

  it('creates the dated record from the exercise picker for a new day', async () => {
    const user = setup('/history/new?date=2020-02-03')
    await user.click(await screen.findByRole('button', { name: 'ベンチプレス' }))
    await user.type(await screen.findByLabelText('1セット目の重さ'), '60')
    await user.type(screen.getByLabelText('1セット目の回数'), '10')
    await user.click(screen.getByRole('button', { name: '保存して履歴に戻る' }))
    expect(await screen.findByText('履歴に戻りました')).toBeInTheDocument()
    expect(api.createDatedWorkout).toHaveBeenCalledWith('u1', expect.any(String), '2020-02-03')
    expect(api.saveEditableSet).toHaveBeenCalledWith(api.createDatedWorkout.mock.calls[0][1], expect.objectContaining({ weight_kg: 60, reps: 10 }), 0)
  })

  it('removes the emptied record when every row is deleted', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'ベンチプレス 1セット目を削除' }))
    await user.click(screen.getByRole('button', { name: '保存して履歴に戻る' }))
    expect(await screen.findByText('履歴に戻りました')).toBeInTheDocument()
    expect(api.removeWorkoutSet).toHaveBeenCalledWith('w1', 's1')
    expect(api.deleteWorkoutIfEmpty).toHaveBeenCalledWith('w1')
  })

  it('asks before going back with a row that has only the weight', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'ベンチプレスにセットを追加' }))
    await user.type(screen.getByLabelText('2セット目の重さ'), '85')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: '保存して履歴に戻る' }))
    expect(confirm).toHaveBeenCalledWith('重量か回数が入っていないセットが1件あります。保存せずに履歴に戻りますか？')
    expect(screen.queryByText('履歴に戻りました')).toBeNull()
    confirm.mockRestore()
  })
})
