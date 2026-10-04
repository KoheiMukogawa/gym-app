import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogPage } from './LogPage'
import { ToastProvider } from '../../components/ui/Toast'
import { saveDraft, loadDraft } from './persistence'
import type { Exercise } from '../../lib/types'
vi.mock('../routines/queries', async (original) => ({
  ...await original<typeof import('../routines/queries')>(),
  fetchRoutines: async () => [], fetchExerciseOrder: async () => [],
}))

const USER = 'user-1'

// jsdom has no modal top layer; the browser tests exercise focus containment.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})

const { createWorkout, saveSet, deleteWorkoutIfEmpty, deleteSet, fetchUserSetHistory, fetchTodayWorkout, updateSetNote } = vi.hoisted(
  () => ({
    updateSetNote: vi.fn(),
    fetchTodayWorkout: vi.fn(),
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
  fetchTodayWorkout,
  updateSetNote,
}))

const lastDeleteButton = () => screen.getAllByRole('button', { name: /を削除$/ }).at(-1)!

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
    fetchTodayWorkout.mockResolvedValue(null)
    fetchBodyweightLogs.mockResolvedValue([])
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

  it('continues today\'s workout instead of starting a second one for the day', async () => {
    fetchTodayWorkout.mockResolvedValue({
      id: 'today',
      sets: [{ id: 'old', exercise_id: 'bench', set_index: 1, weight_kg: 60, reps: 10 }],
    })

    renderLogPage()
    expect(await screen.findByRole('heading', { name: '次はどの種目？' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /ベンチプレス/ })[0])
    await userEvent.click(await screen.findByRole('button', { name: /セット完了/ }))

    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))
    expect(createWorkout).not.toHaveBeenCalled()
    expect(saveSet).toHaveBeenCalledWith('today', expect.objectContaining({ exercise_id: 'bench', set_index: 2 }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('does not create a draft just by loading today\'s sets, so a finished day is not treated as in progress', async () => {
    fetchTodayWorkout.mockResolvedValue({
      id: 'today',
      sets: [{ id: 'old', exercise_id: 'bench', set_index: 1, weight_kg: 60, reps: 10 }],
    })
    renderLogPage()
    expect(await screen.findByRole('heading', { name: '次はどの種目？' })).toBeInTheDocument()
    expect(loadDraft(USER)).toBeNull()
    await userEvent.click(screen.getAllByRole('button', { name: /ベンチプレス/ })[0])
    await waitFor(() => expect(loadDraft(USER)?.workoutId).toBe('today'))
  })

  it('does not load today\'s workout over a restored draft that already has one', async () => {
    saveDraft(USER, {
      state: { currentExerciseId: 'bench', weight_kg: 80, reps: 8, sets: [{ id: 'd1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }] },
      workoutId: 'w0',
      status: { d1: 'saved' },
    })
    renderLogPage()
    await screen.findByRole('button', { name: /セット完了/ })
    expect(fetchTodayWorkout).not.toHaveBeenCalled()
  })

  it('deletes a set from the middle of the list', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(2))
    const firstId = saveSet.mock.calls[0][1].id

    await userEvent.click(screen.getAllByRole('button', { name: /を削除$/ })[0])

    await waitFor(() => expect(deleteSet).toHaveBeenCalledWith(firstId))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
  })

  it('asks for bodyweight first, then records assisted chin-ups against the total load', async () => {
    const CHIN: Exercise = { ...BENCH, id: 'chin', name: 'チンニング', name_normalized: 'チンニング', muscle_group: 'back', is_bodyweight: true }
    fetchExercises.mockResolvedValue([BENCH, CHIN])
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveBodyweight.mockResolvedValue({ recorded_on: '2026-10-01', bodyweight_kg: 70 })
    saveDraft(USER, { state: { currentExerciseId: 'chin', weight_kg: 0, reps: 8, sets: [] }, workoutId: null, status: {} })

    renderLogPage()
    expect(await screen.findByText(/体重＋加重/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /セット完了/ })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('体重（kg）'), '70')
    await userEvent.click(screen.getByRole('button', { name: '体重を保存' }))

    expect(await screen.findByText(/総重量/)).toHaveTextContent('総重量 70 kg')
    await userEvent.click(screen.getByRole('button', { name: '加重を直接入力' }))
    const added = screen.getByRole('spinbutton', { name: '加重' })
    await userEvent.clear(added)
    await userEvent.type(added, '-20')
    expect(screen.getByText(/総重量/)).toHaveTextContent('総重量 50 kg')
    await userEvent.click(screen.getByRole('button', { name: /セット完了/ }))

    await waitFor(() => expect(saveSet).toHaveBeenCalledWith('w1', expect.objectContaining({ exercise_id: 'chin', weight_kg: -20 })))
    expect(screen.getByRole('listitem')).toHaveTextContent('−20 kg')
  })

  it('does not allow a negative weight on a regular exercise', async () => {
    seedDraftWithExercise()
    renderLogPage()
    await userEvent.click(await screen.findByRole('button', { name: '重量を直接入力' }))
    const weight = screen.getByRole('spinbutton', { name: '重量' })
    await userEvent.clear(weight)
    await userEvent.type(weight, '-20')
    await userEvent.click(screen.getByRole('button', { name: /セット完了/ }))
    expect(saveSet).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ weight_kg: -20 }))
  })

  it('keeps the entry area to the numbers and adds memos by tapping the recorded set', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    updateSetNote.mockResolvedValue(undefined)
    renderLogPage()
    await screen.findByRole('spinbutton', { name: '重量' })
    expect(screen.queryByPlaceholderText(/メモ（任意）/)).not.toBeInTheDocument()
    expect(screen.queryByText(/この重量の(自己ベスト|目安)/)).not.toBeInTheDocument()
    expect(screen.queryByText(/推定1RM/)).not.toBeInTheDocument()
    expect(screen.queryByText('スクロール / 数字をタップして入力')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /セット完了/ }))
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    await userEvent.click(await screen.findByRole('button', { name: /のメモを追加/ }))
    await userEvent.type(screen.getByRole('textbox', { name: 'セットのメモ' }), '最後は補助あり')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(updateSetNote).toHaveBeenCalledWith(saveSet.mock.calls[0][1].id, '最後は補助あり'))
    expect(await screen.findByText('最後は補助あり')).toBeInTheDocument()
  })

  it('keeps failed memo input for retry and restores the set controls after saving', async () => {
    saveDraft(USER, {
      state: { currentExerciseId: 'bench', weight_kg: 82.3, reps: 7, sets: [
        { id: 's1', exercise_id: 'bench', set_index: 3, weight_kg: 80, reps: 8, note: '元のメモ' },
      ] }, workoutId: 'w1', status: {},
    })
    updateSetNote.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(undefined)
    renderLogPage()
    await userEvent.click(await screen.findByRole('button', { name: /のメモ: 元のメモ/ }))
    expect(screen.getByRole('dialog', { name: 'セットのメモ' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'セットのメモ' })).toHaveTextContent('ベンチプレス · 1set · 80kg × 8回')
    expect(screen.queryByRole('region', { name: 'セット入力' })).not.toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'セットのメモ' })
    expect(input).toHaveValue('元のメモ')
    await userEvent.clear(input)
    await userEvent.type(input, '肩甲骨を寄せる\n最後は補助あり')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(input).toHaveValue('肩甲骨を寄せる\n最後は補助あり')
    expect(loadDraft(USER)?.state.sets[0].note).toBe('元のメモ')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateSetNote).toHaveBeenLastCalledWith('s1', '肩甲骨を寄せる\n最後は補助あり')
    expect(screen.getByRole('spinbutton', { name: '重量' })).toHaveAttribute('aria-valuenow', '82.3')
    expect(screen.getByRole('spinbutton', { name: '回数' })).toHaveAttribute('aria-valuenow', '7')
    expect(loadDraft(USER)?.state.currentExerciseId).toBe('bench')
  })

  it('asks before discarding memo changes and leaves the saved memo and entry values intact', async () => {
    saveDraft(USER, {
      state: { currentExerciseId: 'bench', weight_kg: 82.3, reps: 7, sets: [
        { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8, note: '元のメモ' },
      ] }, workoutId: 'w1', status: {},
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    try {
      renderLogPage()
      await userEvent.click(await screen.findByRole('button', { name: /のメモ: 元のメモ/ }))
      await userEvent.type(screen.getByRole('textbox', { name: 'セットのメモ' }), '変更')
      await userEvent.click(screen.getByRole('button', { name: '入力を閉じる' }))
      expect(screen.getByRole('dialog', { name: 'セットのメモ' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '入力を閉じる' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(loadDraft(USER)?.state.sets[0].note).toBe('元のメモ')
      expect(screen.getByRole('spinbutton', { name: '重量' })).toHaveAttribute('aria-valuenow', '82.3')
      expect(updateSetNote).not.toHaveBeenCalled()
    } finally { confirm.mockRestore() }
  })

  it('calls deleteSet when undoing a saved set', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    await userEvent.click(lastDeleteButton())

    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
  })

  it('removes the workout when its last saved set is deleted, and recreates it for the next set', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValueOnce({ id: 'w1' }).mockResolvedValueOnce({ id: 'w2' })
    deleteWorkoutIfEmpty.mockResolvedValue(true)

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    // Without this, history shows an empty "0セット" workout until 終了 is pressed.
    await userEvent.click(lastDeleteButton())
    await waitFor(() => expect(deleteWorkoutIfEmpty).toHaveBeenCalledWith('w1'))

    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenLastCalledWith('w2', expect.anything()))
  })

  it('keeps the workout when other sets remain after a delete', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(2))

    await userEvent.click(lastDeleteButton())
    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
    expect(deleteWorkoutIfEmpty).not.toHaveBeenCalled()
  })

  it('does not call deleteSet when undoing a set whose save failed', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveSet.mockRejectedValue({ message: 'boom' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await screen.findByRole('button', { name: /未保存/ })

    await userEvent.click(lastDeleteButton())

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

    await userEvent.click(lastDeleteButton())

    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
    // 削除が失敗したので、行は消えずに残っている
    expect(screen.queryByText('最初のセットを記録しましょう')).not.toBeInTheDocument()
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

  it('recovers via the toast\'s 再試行 (not just the row button) after a reset caused by a failed save', async () => {
    // Important 1 (round 3) の回帰テスト。トーストの再試行は、失敗発生時点の
    // persist クロージャを保持し続ける。workoutId を state ではなく ref から
    // 読むようになっていないと、リセット後もこの古いクロージャは削除済みの
    // ワークアウト id を使い続け、再試行のたびに同じ失敗を繰り返す。
    seedDraftWithExercise()
    createWorkout.mockResolvedValueOnce({ id: 'w1' }).mockResolvedValueOnce({ id: 'w2' }).mockResolvedValueOnce({ id: 'w3' })
    saveSet
      .mockResolvedValueOnce(undefined) // セット A は w1 に保存される
      .mockRejectedValueOnce({ message: 'boom' }) // セット B は w2 で失敗する
      .mockResolvedValueOnce(undefined) // 再試行後のセット B
    deleteWorkoutIfEmpty.mockResolvedValue(true) // 空になったワークアウトは消える

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })

    // セット A を記録・保存する
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    // セット A を取り消す（空になった w1 はその場で削除される）
    await userEvent.click(lastDeleteButton())
    await waitFor(() => expect(deleteWorkoutIfEmpty).toHaveBeenCalledWith('w1'))

    // セット B を記録 → w2 を作るが保存が失敗し、w2 は空なので削除され workoutId がリセットされる
    await userEvent.click(button)
    await waitFor(() => expect(deleteWorkoutIfEmpty).toHaveBeenCalledWith('w2'))

    // 行の「未保存」ボタンではなく、トーストの「再試行」を押す
    const toastRetry = await screen.findByRole('button', { name: '再試行' })
    await userEvent.click(toastRetry)

    await waitFor(() => expect(createWorkout).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(saveSet).toHaveBeenLastCalledWith('w3', expect.anything()))
  })

  it('does not resurrect a saved status for a set abandoned while a stacked retry (row button + still-visible toast) is racing', async () => {
    // Important 2 (round 3) の回帰テスト。同じ id に対して二つの再試行の入り口
    // （行の「未保存」ボタンと、まだ画面に残っているトースト）が同時に存在しうる。
    // abandonedIdsRef のチェックが読んだ時点で印を消してしまうと、片方の
    // チェックがもう片方の判断を狂わせる。
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    const deferred: { resolve?: () => void } = {}
    saveSet
      .mockRejectedValueOnce({ message: 'boom' }) // 最初の保存が失敗 → トースト表示
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            deferred.resolve = resolve
          }),
      ) // 行ボタンからの再試行は保留にする

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)

    // 行の「未保存」を押す（この再試行はまだ保留のまま = deferred）
    const rowRetry = await screen.findByRole('button', { name: /未保存/ })
    await userEvent.click(rowRetry)

    // 保留のうちに取り消す
    await userEvent.click(lastDeleteButton())
    expect(screen.getByText('最初のセットを記録しましょう')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(deleteSet).not.toHaveBeenCalled()

    // まだ画面に残っているトーストの「再試行」を押す（同じセットへのもう一つの入り口）
    const toastRetry = screen.getByRole('button', { name: '再試行' })
    await userEvent.click(toastRetry)

    // 行ボタンからの再試行（保留にしていたほう）がいまさら成功する
    deferred.resolve?.()

    await waitFor(() => expect(deleteSet).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(loadDraft(USER)?.status ?? {}).toEqual({}))
  })

  it('keeps the same workout when a later save fails but the workout already has other saved sets', async () => {
    // deleted === false の分岐のためのテスト（round 2 の deviation の正当性の裏付け）。
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveSet
      .mockResolvedValueOnce(undefined) // セット A -> w1 に保存される
      .mockRejectedValueOnce({ message: 'boom' }) // セット B -> 失敗
      .mockResolvedValueOnce(undefined) // 再試行されたセット B -> 同じ w1 に保存されるべき
    deleteWorkoutIfEmpty.mockResolvedValue(false) // w1 にはまだ A があるので削除されない

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button) // セット A
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    await userEvent.click(button) // セット B、失敗する
    await screen.findByRole('button', { name: /未保存/ })
    await waitFor(() => expect(deleteWorkoutIfEmpty).toHaveBeenCalledWith('w1'))

    await userEvent.click(screen.getByRole('button', { name: /未保存/ })) // 行から再試行

    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(3))
    expect(createWorkout).toHaveBeenCalledTimes(1)
    const workoutIdsUsed = saveSet.mock.calls.map((call) => call[0] as string)
    expect(workoutIdsUsed).toEqual(['w1', 'w1', 'w1'])
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
    await userEvent.click(lastDeleteButton())
    expect(screen.getByText('最初のセットを記録しましょう')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
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

  it('does not double-delete when the undo control is tapped twice quickly, dropping exactly one row', async () => {
    // 1件だけだと「2行落ちて1件しか消えていない」というバグを観測できない。
    // 2件以上仕込んで、残りがちょうど1件であることを確認する。
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveSet.mockResolvedValue(undefined)

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button) // セット1
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))
    await userEvent.click(button) // セット2
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    const deferred: { resolve?: () => void } = {}
    deleteSet.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve
        }),
    )

    await userEvent.click(lastDeleteButton())
    // 削除中は削除ボタンが無効化されているので、2回目のタップは効かない
    expect(lastDeleteButton()).toBeDisabled()
    await userEvent.click(lastDeleteButton())

    deferred.resolve?.()

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(deleteSet).toHaveBeenCalledTimes(1)
  })

  it('finishes without asking when there are no unsaved sets', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await waitFor(() => expect(saveSet).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: '記録を終了' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    confirmSpy.mockRestore()
  })

  it('asks for confirmation naming the count before discarding unsaved sets, and does nothing if cancelled', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveSet.mockRejectedValue({ message: 'boom' })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await screen.findByRole('button', { name: /未保存/ })

    await userEvent.click(screen.getByRole('button', { name: '記録を終了' }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('1件'))
    expect(navigate).not.toHaveBeenCalled()
    expect(loadDraft(USER)).not.toBeNull()
    confirmSpy.mockRestore()
  })

  it('discards the draft and navigates away once the user confirms losing unsaved sets', async () => {
    seedDraftWithExercise()
    createWorkout.mockResolvedValue({ id: 'w1' })
    saveSet.mockRejectedValue({ message: 'boom' })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderLogPage()
    const button = await screen.findByRole('button', { name: /セット完了/ })
    await userEvent.click(button)
    await screen.findByRole('button', { name: /未保存/ })

    await userEvent.click(screen.getByRole('button', { name: '記録を終了' }))

    expect(confirmSpy).toHaveBeenCalled()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(loadDraft(USER)).toBeNull()
    confirmSpy.mockRestore()
  })
})
