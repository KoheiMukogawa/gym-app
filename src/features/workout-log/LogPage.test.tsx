import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogPage } from './LogPage'
import { ToastProvider } from '../../components/ui/Toast'
import { saveDraft, loadDraft } from './persistence'
import type { Exercise } from '../../lib/types'

const USER = 'user-1'

const { createWorkout, saveSet, deleteWorkoutIfEmpty, deleteSet, fetchUserSetHistory } = vi.hoisted(
  () => ({
    createWorkout: vi.fn(),
    saveSet: vi.fn(),
    deleteWorkoutIfEmpty: vi.fn(),
    deleteSet: vi.fn(),
    fetchUserSetHistory: vi.fn(),
  }),
)

vi.mock('./queries', () => ({
  createWorkout,
  saveSet,
  deleteWorkoutIfEmpty,
  deleteSet,
  fetchUserSetHistory,
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

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession }))

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

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

describe('LogPage', () => {
  let onLineSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    useSession.mockReturnValue({
      userId: USER,
      profile: null,
      loading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    })
    fetchExercises.mockResolvedValue([BENCH])
    fetchRecentExerciseIds.mockResolvedValue([])
    fetchUserSetHistory.mockResolvedValue([])
    saveSet.mockResolvedValue(undefined)
    deleteWorkoutIfEmpty.mockResolvedValue(false)
    deleteSet.mockResolvedValue(undefined)
  })

  afterEach(() => {
    onLineSpy?.mockRestore()
    onLineSpy = null
  })

  it('makes exactly one createWorkout call for two rapid セット完了 taps, and both saves target the same workout', async () => {
    seedDraftWithExercise()
    const deferred: { resolve?: (w: { id: string }) => void } = {}
    createWorkout.mockImplementation(
      () =>
        new Promise<{ id: string }>((resolve) => {
          deferred.resolve = resolve
        }),
    )

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })

    await userEvent.click(button)
    await userEvent.click(button)

    expect(createWorkout).toHaveBeenCalledTimes(1)

    deferred.resolve?.({ id: 'w1' })
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(2))

    const workoutIdsUsed = saveSet.mock.calls.map((call) => call[0] as string)
    expect(workoutIdsUsed).toEqual(['w1', 'w1'])
  })

  it('persists the real workoutId in the draft after one successful save', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)

    await waitFor(() => expect(loadDraft(USER)?.workoutId).toBe('w1'))
  })

  it('shows the 未保存 state for a set whose save failed, and keeps it after a re-render', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveSet.mockRejectedValue({ message: 'boom' })

    const { rerender } = renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)

    await screen.findByRole('button', { name: /未保存/ })

    rerender(
      <ToastProvider>
        <LogPage />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: /未保存/ })).toBeInTheDocument()
  })

  it('calls deleteSet when undoing a saved set', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: '直前のセットを取り消す' }))

    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
  })

  it('does not call deleteSet when undoing a set whose save failed', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveSet.mockRejectedValue({ message: 'boom' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await screen.findByRole('button', { name: /未保存/ })

    await userEvent.click(screen.getByRole('button', { name: '直前のセットを取り消す' }))

    expect(deleteSet).not.toHaveBeenCalled()
  })

  it('disables セット完了 while offline', async () => {
    onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    seedDraftWithExercise()

    renderLogPage()
    const button = await screen.findByRole('button', { name: /オフライン|セット完了/ })

    expect(button).toBeDisabled()
  })

  it('leaves the row on screen and surfaces an error toast when deleteSet fails during undo', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    deleteSet.mockRejectedValue({ message: 'network down' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: '直前のセットを取り消す' }))

    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
    // 削除が失敗したので、行は消えずに残っている
    expect(screen.queryByText('まだ記録がありません')).not.toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('エラーが発生しました')
  })

  it('recreates the workout on the next attempt after a first-save failure deletes the empty workout', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValueOnce({ id: 'w1' }).mockResolvedValueOnce({ id: 'w2' })
    saveSet.mockRejectedValueOnce({ message: 'boom' }).mockResolvedValueOnce(undefined)
    deleteWorkoutIfEmpty.mockResolvedValue(true)

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)

    await screen.findByRole('button', { name: /未保存/ })
    expect(createWorkout).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(deleteWorkoutIfEmpty).toHaveBeenCalledWith('w1'))

    await userEvent.click(screen.getByRole('button', { name: /未保存/ }))

    await waitFor(() => expect(createWorkout).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(saveSet).toHaveBeenLastCalledWith('w2', expect.anything()))
  })

  it('issues a compensating deleteSet when a pending set is undone before its save resolves', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    const deferred: { resolve?: () => void } = {}
    saveSet.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve
        }),
    )

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)

    // 保存がまだ pending のうちに取り消す
    await userEvent.click(screen.getByRole('button', { name: '直前のセットを取り消す' }))
    expect(screen.getByText('まだ記録がありません')).toBeInTheDocument()
    expect(deleteSet).not.toHaveBeenCalled()

    // 保存がいまさら成功する
    deferred.resolve?.()

    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
  })

  it('presents a restored pending status as failed, with a retry control', async () => {
    saveDraft(USER, {
      state: {
        currentExerciseId: 'bench',
        weight_kg: 80,
        reps: 8,
        sets: [{ id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }],
      },
      workoutId: 'w1',
      status: { s1: 'pending' },
    })

    renderLogPage()
    await screen.findByRole('button', { name: /セット完了/ })

    expect(screen.getByRole('button', { name: /未保存/ })).toBeInTheDocument()
  })

  it('does not double-delete when the undo control is tapped twice quickly', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    const deferred: { resolve?: () => void } = {}
    deleteSet.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve
        }),
    )

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: '直前のセットを取り消す' }))
    // 進行中は取り消し中…に変わり、無効化されているので2回目のタップは効かない
    await userEvent.click(screen.getByRole('button', { name: '取り消し中…' }))

    deferred.resolve?.()
    await waitFor(() => expect(screen.getByText('まだ記録がありません')).toBeInTheDocument())

    expect(deleteSet).toHaveBeenCalledTimes(1)
  })
})
