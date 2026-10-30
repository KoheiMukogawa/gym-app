import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogPage } from './LogPage'
import { ToastProvider } from '../../components/ui/Toast'
import { loadDraft, saveDraft } from './persistence'
import { saveInputMode } from './inputMode'
import type { Exercise } from '../../lib/types'
vi.mock('../routines/queries', async (original) => ({
  ...await original<typeof import('../routines/queries')>(),
  fetchRoutines: async () => [], fetchExerciseOrder: async () => [],
  fetchExerciseVisibility: async () => ({ addedIds: [], hiddenIds: [] }),
}))

const USER = 'user-1'

const { createWorkout, saveSet, deleteWorkoutIfEmpty, deleteSet, fetchUserSetHistory, fetchTodayWorkout, updateSetNote, fetchPreviousWorkout } = vi.hoisted(
  () => ({
    updateSetNote: vi.fn(),
    fetchPreviousWorkout: vi.fn(),
    fetchTodayWorkout: vi.fn(),
    createWorkout: vi.fn(),
    saveSet: vi.fn(),
    deleteWorkoutIfEmpty: vi.fn(),
    deleteSet: vi.fn(),
    fetchUserSetHistory: vi.fn(),
  }),
)

const { saveEditableSet, removeWorkoutSet } = vi.hoisted(() => ({ saveEditableSet: vi.fn(), removeWorkoutSet: vi.fn() }))
vi.mock('../history/editorQueries', () => ({ saveEditableSet, removeWorkoutSet }))

vi.mock('./queries', () => ({
  createWorkout,
  saveSet,
  deleteWorkoutIfEmpty,
  deleteSet,
  fetchUserSetHistory,
  fetchTodayWorkout,
  updateSetNote,
  fetchPreviousWorkout,
}))

const { fetchExercises, createExercise, fetchRecentExerciseIds } = vi.hoisted(() => ({
  fetchExercises: vi.fn(),
  createExercise: vi.fn(),
  fetchRecentExerciseIds: vi.fn(),
}))

vi.mock('../exercises/queries', () => ({
  fetchExercises,
  createExercise,
  fetchRecentExerciseIds,
}))

const { fetchBodyweightLogs, saveBodyweight } = vi.hoisted(() => ({
  fetchBodyweightLogs: vi.fn(),
  saveBodyweight: vi.fn(),
}))
vi.mock('../profile/bodyweightQueries', async (original) => ({
  ...await original<typeof import('../profile/bodyweightQueries')>(),
  fetchBodyweightLogs,
  saveBodyweight,
}))

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession }))

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate, Link: ({ to, children, state: _state, ...props }: { to: string, children: React.ReactNode, state?: unknown }) => <a href={to} {...props}>{children}</a> }))

const BENCH: Exercise = {
  id: 'bench',
  name: 'ベンチプレス',
  name_normalized: 'ベンチプレス',
  muscle_group: 'chest',
  is_preset: true,
  created_by: null,
  created_at: '2026-08-01T00:00:00Z',
}

function renderLogPage() {
  return render(
    <ToastProvider>
      <LogPage />
    </ToastProvider>,
  )
}

/** ピッカーを飛ばして記録画面から始めるための下書きを仕込む */
function seedDraftWithExercise() {
  saveDraft(USER, {
    state: { currentExerciseId: 'bench', weight_kg: 80, reps: 8, sets: [] },
    workoutId: null,
    status: {},
  })
}

// jsdom does not implement the modal top layer.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})

describe('LogPage list input', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    useSession.mockReturnValue({ userId: USER, profile: null, loading: false, signOut: vi.fn(), refreshProfile: vi.fn() })
    fetchExercises.mockResolvedValue([BENCH])
    fetchRecentExerciseIds.mockResolvedValue([])
    fetchUserSetHistory.mockResolvedValue([])
    fetchPreviousWorkout.mockResolvedValue(null)
    fetchTodayWorkout.mockResolvedValue(null)
    fetchBodyweightLogs.mockResolvedValue([])
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveEditableSet.mockResolvedValue(undefined)
    removeWorkoutSet.mockResolvedValue(undefined)
    deleteWorkoutIfEmpty.mockResolvedValue(false)
    saveInputMode(USER, 'list')
  })

  it('saves the typed rows only when leaving the exercise, then lists them in today\'s summary', async () => {
    seedDraftWithExercise()
    const user = userEvent.setup()
    renderLogPage()
    await user.type(await screen.findByLabelText('1セット目の重さ'), '100')
    await user.type(screen.getByLabelText('1セット目の回数'), '5')
    await user.click(screen.getByRole('button', { name: 'セットを追加' }))
    await user.click(screen.getByRole('button', { name: '2セット目の重さを上の行から写す' }))
    expect(screen.getByLabelText('2セット目の重さ')).toHaveValue('100')
    await user.type(screen.getByLabelText('2セット目の回数'), '3')
    await user.type(screen.getByLabelText('2セット目のメモ'), '補助あり')
    await user.click(screen.getByRole('button', { name: 'セットを追加' }))
    expect(saveEditableSet).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '今日の記録に戻る' }))
    await waitFor(() => expect(saveEditableSet).toHaveBeenCalledTimes(2))
    // The untouched third row is empty, so it is not saved.
    expect(saveEditableSet.mock.calls.map(([wid, set]) => [wid, set.set_index, set.weight_kg, set.reps, set.note ?? null]))
      .toEqual([['w1', 1, 100, 5, null], ['w1', 2, 100, 3, '補助あり']])
    expect(await screen.findByRole('region', { name: '今日の記録' })).toHaveTextContent('補助あり')
    expect(screen.queryByText('合計セット数')).toBeNull()
    // Sets are deleted by swiping, as on the dial screen (the hidden delete button behind the row).
    deleteSet.mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'ベンチプレス 1セット目を削除' }))
    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('region', { name: '今日の記録' })).not.toHaveTextContent('100.0 kg5 回')
    expect(screen.queryByText('次はどの種目？')).toBeNull()
    await user.click(screen.getByRole('button', { name: '種目を追加' }))
    expect(screen.getByRole('region', { name: '胸の種目' })).toHaveTextContent('ベンチプレス')
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.queryByRole('button', { name: '記録を終了' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'ホームに戻る' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(loadDraft(USER)).toBeNull()
  })

  it('saves nothing for an exercise opened and left without typing', async () => {
    seedDraftWithExercise()
    const user = userEvent.setup()
    renderLogPage()
    await screen.findByLabelText('1セット目の重さ')
    await user.click(screen.getByRole('button', { name: '今日の記録に戻る' }))
    expect(await screen.findByRole('region', { name: '胸の種目' })).toBeInTheDocument()
    expect(saveEditableSet).not.toHaveBeenCalled()
    expect(createWorkout).not.toHaveBeenCalled()
  })

  it('copies the previous workout into the rows', async () => {
    seedDraftWithExercise()
    fetchPreviousWorkout.mockResolvedValue({ performed_at: '2026-10-09T03:00:00Z', sets: [
      { id: 'p1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 },
      { id: 'p2', exercise_id: 'bench', set_index: 2, weight_kg: 85, reps: 5, note: '補助あり' },
    ] })
    const user = userEvent.setup()
    renderLogPage()
    await user.click(await screen.findByRole('button', { name: '1セット目の重さを前回から写す' }))
    expect(screen.getByLabelText('1セット目の重さ')).toHaveValue('80')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '前回の記録を写す' }))
    expect(confirm).toHaveBeenCalledWith('入力中のセットを前回の記録で置き換えますか？')
    expect(screen.getByLabelText('2セット目の重さ')).toHaveValue('85')
    expect(screen.getByLabelText('2セット目のメモ')).toHaveValue('補助あり')
  })

  it('clears a number with the cross button', async () => {
    seedDraftWithExercise()
    const user = userEvent.setup()
    renderLogPage()
    await user.type(await screen.findByLabelText('1セット目の重さ'), '100')
    await user.click(screen.getByRole('button', { name: '1セット目の重さを消す' }))
    expect(screen.getByLabelText('1セット目の重さ')).toHaveValue('')
    expect(screen.getByLabelText('1セット目の重さ')).toHaveFocus()
  })

  it('records in pounds and saves kilograms', async () => {
    seedDraftWithExercise()
    const user = userEvent.setup()
    renderLogPage()
    await user.type(await screen.findByLabelText('1セット目の重さ'), '100')
    await user.type(screen.getByLabelText('1セット目の回数'), '5')
    await user.click(screen.getByRole('radio', { name: 'lbs' }))
    expect(screen.getByLabelText('1セット目の重さ')).toHaveValue('220.5')
    await user.clear(screen.getByLabelText('1セット目の重さ'))
    await user.type(screen.getByLabelText('1セット目の重さ'), '225')
    await user.click(screen.getByRole('button', { name: '今日の記録に戻る' }))
    await waitFor(() => expect(saveEditableSet).toHaveBeenCalledTimes(1))
    expect(saveEditableSet.mock.calls[0][1]).toMatchObject({ weight_kg: 102.1, reps: 5 })
    expect(localStorage.getItem(`glog:weight-unit:${USER}`)).toBe('lbs')
  })

  it('keeps the user on the exercise when a row has only one value', async () => {
    seedDraftWithExercise()
    const user = userEvent.setup()
    renderLogPage()
    await user.type(await screen.findByLabelText('1セット目の重さ'), '100')
    await user.click(screen.getByRole('button', { name: '今日の記録に戻る' }))
    expect(await screen.findAllByText('重量と回数の両方を入れてください')).not.toHaveLength(0)
    expect(saveEditableSet).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('updates only changed sets and deletes removed rows of today\'s workout', async () => {
    fetchTodayWorkout.mockResolvedValue({ id: 'w1', sets: [
      { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 60, reps: 10 },
      { id: 's2', exercise_id: 'bench', set_index: 2, weight_kg: 70, reps: 5 },
    ] })
    const user = userEvent.setup()
    renderLogPage()
    await user.click(await screen.findByRole('button', { name: 'ベンチプレスの記録を開く' }))
    expect(await screen.findByLabelText('2セット目の重さ')).toHaveValue('70')
    await user.clear(screen.getByLabelText('2セット目の重さ'))
    await user.type(screen.getByLabelText('2セット目の重さ'), '72.5')
    await user.click(screen.getByRole('button', { name: 'ベンチプレス 1セット目を削除' }))
    expect(screen.queryByRole('button', { name: '記録を終了' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '今日の記録に戻る' }))
    await user.click(await screen.findByRole('button', { name: 'ホームに戻る' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(removeWorkoutSet).toHaveBeenCalledWith('w1', 's1')
    expect(saveEditableSet).toHaveBeenCalledTimes(1)
    expect(saveEditableSet.mock.calls[0][1]).toMatchObject({ id: 's2', set_index: 1, weight_kg: 72.5, reps: 5 })
  })

  it('saves the rows when the app goes to the background', async () => {
    seedDraftWithExercise()
    const user = userEvent.setup()
    renderLogPage()
    await user.type(await screen.findByLabelText('1セット目の重さ'), '100')
    await user.type(screen.getByLabelText('1セット目の回数'), '5')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(saveEditableSet).toHaveBeenCalledTimes(1))
    vi.restoreAllMocks()
  })

  it('saves the rows and shows the dial when the mode is changed from the menu', async () => {
    seedDraftWithExercise()
    const user = userEvent.setup()
    renderLogPage()
    await user.type(await screen.findByLabelText('1セット目の重さ'), '100')
    await user.type(screen.getByLabelText('1セット目の回数'), '5')
    act(() => saveInputMode(USER, 'dial'))
    expect(await screen.findByLabelText('重量をスクロールで選択')).toBeInTheDocument()
    await waitFor(() => expect(saveEditableSet).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('radiogroup', { name: '入力方法' })).toBeNull()
  })

  it('asks people who signed up after the release to choose the input method', async () => {
    localStorage.clear()
    useSession.mockReturnValue({ userId: USER, profile: { id: USER, display_name: 'a', created_at: '2026-11-01T00:00:00Z' }, loading: false, signOut: vi.fn(), refreshProfile: vi.fn() })
    const user = userEvent.setup()
    renderLogPage()
    await screen.findByText('記録の入れ方を選んでください')
    await user.click(screen.getByRole('button', { name: /^一覧/ }))
    await waitFor(() => expect(screen.queryByText('記録の入れ方を選んでください')).toBeNull())
    expect(localStorage.getItem(`glog:log-input-mode:${USER}`)).toBe('list')
  })
})
