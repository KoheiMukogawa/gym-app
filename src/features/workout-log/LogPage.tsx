import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { findPrefill, weightStep } from '../../lib/calc'
import { localDate, validateSet } from '../../lib/dates'
import { isOffline, toMessage } from '../../lib/errors'
import type { Exercise, MuscleGroup, WorkoutSet } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { SetRmLabel } from './SetRmLabel'
import { markWorkoutFinished } from '../install/installGuide'
import { WheelNumber } from '../../components/ui/WheelNumber'
import { BottomInputDock } from '../../components/ui/BottomInputDock'
import { SlidingDial } from '../../components/ui/SlidingDial'
import { MemoInputSpace } from './SetMemoEditor'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { useSession } from '../auth/SessionProvider'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { createExercise, fetchExercises } from '../exercises/queries'
import { exerciseLabel } from '../exercises/catalog'
import { RoutinePanel } from '../routines/RoutinePanel'
import type { ActiveRoutine } from '../routines/queries'
import { initialLogState, logReducer, nextSet, type LoggedSet } from './logReducer'
import { clearDraft, loadDraft, saveDraft, type SetStatus } from './persistence'
import {
  createWorkout,
  deleteSet,
  deleteWorkoutIfEmpty,
  fetchTodayWorkout,
  fetchUserSetHistory,
  saveSet,
  updateSetNote,
} from './queries'
import { SetList } from './SetList'
import { PreviousWorkoutCard } from './PreviousWorkoutCard'
import { formatAddedLoad, latestBodyweight, totalLoad, type BodyweightLog } from '../../lib/bodyweight'
import { fetchBodyweightLogs, parseBodyweight, saveBodyweight } from '../profile/bodyweightQueries'
import { removeWorkoutSet, saveEditableSet } from '../history/editorQueries'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { ListSetTable } from './ListSetTable'
import { ListPreviousRecord, usePreviousWorkout } from './ListPreviousRecord'
import { GroupedExercisePicker } from './GroupedExercisePicker'
import { TodaySummary } from './TodaySummary'
import { AddFab } from './AddFab'
import { logScreenFor, type LogScreen } from '../admin/screenIds'
import { newRow, planListSave, rowsFromPrevious, rowsFromSets, type ListRow, type ListRows } from './listRows'
import { shouldAskInputMode, useLogInputMode, type LogInputMode } from './inputMode'
import { convertWeightText, useWeightUnit, type WeightUnit } from './weightUnit'

const MODES: [LogInputMode, string, string][] = [
  ['dial', 'ダイヤル', '1セットずつダイヤルで合わせて「セット完了」'],
  ['list', '一覧', 'セットを表に並べて、重量と回数を数字で打つ'],
]

function OfflineBanner() {
  return (
    <p role="alert" className="bg-accent px-4 py-2 text-center text-sm text-white">
      オフラインです。記録は保存できません。
    </p>
  )
}

/**
 * 待ちきりで画面がずっと「終了中…」のままにならないよう、上限時間で打ち切る。
 * 打ち切っても後始末（deleteWorkoutIfEmpty）は試みる。
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve('timeout')
      },
    )
  })
}

export function LogPage({ onFinished, onPickingChange, onScreenChange }: { onFinished?: () => void, onPickingChange?: (picking: boolean) => void, onScreenChange?: (screen: LogScreen) => void }) {
  const { userId, profile } = useSession()
  const { mode, chosen, setMode } = useLogInputMode(userId)
  const [unit, setUnit] = useWeightUnit(userId)
  const navigate = useNavigate()
  const { show } = useToast()

  // マウントごとに1回だけ読む。モジュールスコープに置くと、終了後に開き直した際に
  // 破棄済みの下書きを復元してしまう。
  const [draft] = useState(() => (userId ? loadDraft(userId) : null))

  const [state, rawDispatch] = useReducer(logReducer, draft?.state ?? initialLogState)
  // 下書きは「この画面で操作した」ときだけ保存する。今日の記録をサーバーから読み込んだだけで
  // 下書きができると、終了後に開き直しても記録の途中と判定されてしまう。
  const touchedRef = useRef(draft !== null)
  function dispatch(action: Parameters<typeof rawDispatch>[0]) {
    if (action.type !== 'load-sets') touchedRef.current = true
    rawDispatch(action)
  }
  const [workoutId, setWorkoutIdState] = useState<string | null>(draft?.workoutId ?? null)
  // 復元した pending は「保存できたかどうか分からない」状態なので、failed として
  // 提示し直す。23505 の扱いにより再試行は安全にべき等なので、実際には保存できて
  // いたセットも再試行するだけで済み、本当に失われたセットは再試行の手段を持てる。
  const [statusById, setStatusById] = useState<Record<string, SetStatus>>(() => {
    const initial = draft?.status ?? {}
    const demoted: Record<string, SetStatus> = {}
    for (const [id, st] of Object.entries(initial)) {
      demoted[id] = st === 'pending' ? 'failed' : st
    }
    return demoted
  })
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [routine, setRoutine] = useState<ActiveRoutine | null>(draft?.routine ?? null)
  const [editingRoutine, setEditingRoutine] = useState(false)
  const [history, setHistory] = useState<Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[]>([])
  // 一覧入力の種目選択で「種目を追加」を押したときに開く部位（今までの種目選択の画面を出す）
  const [managingGroup, setManagingGroup] = useState<MuscleGroup | null>(null)
  // 一覧入力の今日の記録（REC-03）で、右下の＋から種目選択（REC-04）を開いているか
  const [choosingExercise, setChoosingExercise] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [picking, setPicking] = useState(draft?.state.currentExerciseId == null)
  // 種目を選んでいる間はタブを出す（AppShell）
  useEffect(() => { onPickingChange?.(picking) }, [picking, onPickingChange])
  // まだ記録が無い日は、今日の記録を飛ばして種目選択から始める
  const listChoosing = choosingExercise || managingGroup !== null || state.sets.length === 0
  // 管理者向けの画面ID。ダイヤルと一覧で別の画面として数える
  const logScreen = logScreenFor(mode, picking, listChoosing)
  useEffect(() => { onScreenChange?.(logScreen) }, [logScreen, onScreenChange])
  const [justSaved, setJustSaved] = useState(false)
  const [offline, setOffline] = useState(isOffline())
  const [finishing, setFinishing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([])
  const [bodyweightDraft, setBodyweightDraft] = useState('')
  const [editingBodyweight, setEditingBodyweight] = useState(false)
  const [savingBodyweight, setSavingBodyweight] = useState(false)
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  // 一覧入力の行。保存は記録画面を抜けるとき（flushList）にまとめて行う
  const [listRows, setListRowsState] = useState<ListRows | null>(draft?.listRows ?? null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [savingList, setSavingList] = useState(false)
  const previous = usePreviousWorkout(mode === 'list' ? userId : null, state.currentExerciseId)
  function setListRows(next: ListRows | null) {
    touchedRef.current = true
    setListRowsState(next)
  }
  const recordingHeader = useRef<HTMLElement>(null)

  useEffect(() => {
    // A picker can be scrolled far down. Show the newly selected exercise at the
    // top without moving the list on every set save or while another tab is open.
    if (!loading && !picking && !recordingHeader.current?.closest('[hidden]')) {
      recordingHeader.current?.scrollIntoView?.({ block: 'start' })
    }
  }, [loading, picking, state.currentExerciseId])

  // ワークアウト作成の二重発行を防ぐための、進行中の作成 Promise。
  // 1件目の呼び出しがこれを埋め、以降の呼び出しは同じ Promise を待つだけにする。
  const workoutCreationRef = useRef<Promise<string> | null>(null)
  // workoutId の「今の値」を常に指すミラー。persist は state ではなくこれを読む。
  // トーストの「再試行」ボタンは、失敗が起きた時点の persist クロージャを
  // 保持し続ける（Toast は自己消滅するだけで置き換わらない）。そのクロージャの
  // workoutId は state から読むと作成時点の値に固定されたままになり、後で
  // ワークアウトがリセットされても追随しない。ref なら、どのクロージャから
  // 読んでも常に最新の値になる。setWorkoutId 経由でのみ更新すること。
  const workoutIdRef = useRef<string | null>(workoutId)
  // 最後のセットを取り消したあとの空ワークアウト削除。次のセットの保存は
  // これを待ってから workoutId を読む（削除中のワークアウトに書き込まないため）。
  const emptyCleanupRef = useRef<Promise<void> | null>(null)
  function setWorkoutId(id: string | null) {
    workoutIdRef.current = id
    setWorkoutIdState(id)
  }
  // 現在進行中の保存（作成＋セット保存）を追跡する。終了処理がこれの完了を
  // 待ってからワークアウトの掃除に入ることで、保存中のワークアウトを
  // 削除してしまう競合を防ぐ。
  const pendingSavesRef = useRef<Set<Promise<void>>>(new Set())
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 取り消し済みだが、保存処理がまだ進行中（またはこれから再試行される）かもしれない
  // セット id の集合。persist 側はこれを見て、既に取り消されたセットを新たに
  // 保存してしまったり、保存済みのまま置き去りにしたりしないようにする。
  // マウント中は書き込み専用（一度入れたら消さない）：同じ id に対して複数の
  // 再試行の入り口（行の未保存ボタンと、画面に残ったトーストなど）が同時に
  // 存在しうるため、片方が読んだ時点で消してしまうと、もう片方が「取り消されて
  // いない」と誤認してしまう。id は UUID で使い回されないので、消さなくても
  // 安全（このマウント中に取り消した件数分しか増えない）。
  const abandonedIdsRef = useRef<Set<string>>(new Set())
  // 今日のワークアウトの読み込みは1回だけ行う（再試行で記録中のセットを上書きしないため）
  const todayLoadedRef = useRef(false)

  // 認証切れやリロードで画面が失われても記録を復元できるよう、変更のたびに退避する。
  // workoutId は state 化したので、作成直後の値も取りこぼさずに書き込まれる。
  useEffect(() => {
    if (!userId || !touchedRef.current) return
    saveDraft(userId, { state, workoutId, status: statusById, routine, listRows })
  }, [state, workoutId, statusById, userId, routine, listRows])

  useEffect(() => {
    const update = () => setOffline(isOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setLoadError(null)
    // 1日の記録は1件にまとめる。下書きが無ければ、今日すでに保存したセットを読み込んで続きから記録する。
    const resumeToday = !draft?.workoutId && !draft?.state.sets.length && !todayLoadedRef.current
    Promise.all([fetchExercises(), fetchUserSetHistory(userId), resumeToday ? fetchTodayWorkout(userId) : Promise.resolve(null), fetchBodyweightLogs(userId)])
      .then(([ex, hist, today, logs]) => {
        if (!active) return
        setExercises(ex)
        setHistory(hist)
        setBodyweightLogs(logs)
        if (resumeToday) todayLoadedRef.current = true
        if (today) {
          setWorkoutId(today.id)
          dispatch({ type: 'load-sets', sets: today.sets })
        }
      })
      .catch((e) => { if (active) setLoadError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, loadAttempt])

  const exerciseNames = Object.fromEntries(exercises.map((e) => [e.id, exerciseLabel(e)]))
  const bodyweightIds = exercises.filter((e) => e.is_bodyweight).map((e) => e.id)
  const isBodyweight = state.currentExerciseId !== null && bodyweightIds.includes(state.currentExerciseId)
  const bodyweight = latestBodyweight(bodyweightLogs)
  // 自重種目は体重分までのアシスト（マイナス）を許す
  const minWeight = isBodyweight && bodyweight !== null ? -bodyweight : 0
  // ダンベルやマシンのように1kg単位で記録している種目は、ダイヤルも1kg刻みにする（今日のセット→過去の記録の新しい順）
  const dialStep = weightStep([...[...state.sets].reverse(), ...history].filter((s) => s.exercise_id === state.currentExerciseId).map((s) => s.weight_kg))
  const load = isBodyweight ? totalLoad(state.weight_kg, bodyweight) : state.weight_kg
  const loadOffset = isBodyweight ? bodyweight ?? 0 : 0

  async function handleSaveBodyweight() {
    const value = parseBodyweight(bodyweightDraft)
    if (!userId || value === null) { show('体重は20〜300kgで入力してください'); return }
    setSavingBodyweight(true)
    try {
      const log = await saveBodyweight(userId, value)
      setBodyweightLogs((old) => [...old.filter((l) => l.recorded_on !== log.recorded_on), log])
      setEditingBodyweight(false)
    } catch (e) { show(toMessage(e)) }
    finally { setSavingBodyweight(false) }
  }

  function selectExercise(exerciseId: string) {
    const bw = exercises.some((e) => e.id === exerciseId && e.is_bodyweight)
    // 自重種目は体重を足した総重量で換算する
    const loadOffset = bw ? latestBodyweight(bodyweightLogs) ?? 0 : 0
    dispatch({ type: 'select-exercise', exerciseId, prefill: findPrefill(history, exerciseId), defaultWeight: bw ? 0 : undefined, history, loadOffset })
    setChoosingExercise(false)
    setManagingGroup(null)
    setPicking(false)
  }
  async function moveRoutine(direction: -1 | 1) {
    if (!routine) return
    const index = routine.index + direction
    if (index < 0 || index >= routine.exerciseIds.length) return
    const id = routine.exerciseIds[index]
    if (!exercises.some((e) => e.id === id)) { show('この種目は見つかりません。ルーティンを編集してください。'); return }
    if ((await flushList()) === null) return
    setRoutine({ ...routine, index })
    selectExercise(id)
  }

  function showJustSaved() {
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current)
    setJustSaved(true)
    justSavedTimerRef.current = setTimeout(() => {
      setJustSaved(false)
      justSavedTimerRef.current = null
    }, 1200)
  }

  // 今日のワークアウトのIDを返す。まだ無ければ作る（同時に呼ばれても1件だけ作る）
  const ensureWorkout = useCallback(async (): Promise<string> => {
    if (!userId) throw new Error('サインインしていません')
    if (emptyCleanupRef.current) await emptyCleanupRef.current
    // workoutId は state ではなく ref から読む。古いクロージャから呼ばれても最新の値になる
    const current = workoutIdRef.current
    if (current !== null) return current
    if (workoutCreationRef.current === null) {
      workoutCreationRef.current = createWorkout(userId)
        .then((workout) => {
          setWorkoutId(workout.id)
          return workout.id
        })
        .catch((e: unknown) => {
          // 失敗した作成は次回また作り直せるようにリセットする
          workoutCreationRef.current = null
          throw e
        })
    }
    return workoutCreationRef.current
  }, [userId])

  const persist = useCallback(
    (set: LoggedSet): Promise<void> => {
      if (!userId) throw new Error('サインインしていません')

      // 送信前に既に取り消されていた（例: 再試行トーストが表示されている間に
      // 「取り消す」を押した）場合は、何もせず終える。表示にも影響を与えない。
      // ここでは印を消さない — 同じ id に対して別の再試行（行のボタンや、
      // まだ画面に残っている別のトースト）が並行して進行中かもしれず、
      // 片方が読んだ時点で消してしまうと、もう片方が判断を誤る。
      if (abandonedIdsRef.current.has(set.id)) {
        return Promise.resolve()
      }

      setStatusById((prev) => ({ ...prev, [set.id]: 'pending' }))

      const task = (async () => {
        let wid: string | null = null
        try {
          wid = await ensureWorkout()
          await saveSet(wid, set)

          if (abandonedIdsRef.current.has(set.id)) {
            // 保存が完了するまでの間に取り消されていた。取り消しの意図を
            // 裏切らないよう、コミットされてしまった行を消して帳尻を合わせる。
            try {
              await deleteSet(set.id)
            } catch (compensationError) {
              console.error(
                `取り消し済みセットの補償削除に失敗しました (set: ${set.id})`,
                compensationError,
              )
            }
            return
          }

          setStatusById((prev) => ({ ...prev, [set.id]: 'saved' }))
          showJustSaved()
        } catch (e) {
          if (abandonedIdsRef.current.has(set.id)) {
            // 取り消し済みのセットは、保存に失敗しても表示すべき行がもう無い
            return
          }
          setStatusById((prev) => ({ ...prev, [set.id]: 'failed' }))
          // このセットの保存に失敗した時点で他に進行中の保存がなければ、
          // ワークアウトはまだ空である可能性が高い。終了を待たず掃除する。
          // pendingSavesRef にはこのタスク自身がまだ含まれているので、
          // サイズが1（自分だけ）のときだけ安全に判断できる。
          if (wid !== null && pendingSavesRef.current.size <= 1) {
            try {
              const deleted = await deleteWorkoutIfEmpty(wid)
              if (deleted) {
                // ワークアウトは実際に消えたので、次の保存は作り直す必要がある。
                // ここをリセットし忘れると、以降のすべての保存が既に存在しない
                // ワークアウトに向けて送られ続け、外部キー違反や RLS 拒否で
                // 永久に失敗し続けてしまう。setWorkoutId は ref も同時に更新する
                // ので、この後どの persist クロージャから再試行されても正しく
                // 「作り直しが必要」と判断できる。
                setWorkoutId(null)
                workoutCreationRef.current = null
              }
            } catch (cleanupError) {
              console.error(`空ワークアウトの削除に失敗しました (workout: ${wid})`, cleanupError)
            }
          }
          show(toMessage(e), { label: '再試行', onClick: () => void persist(set) })
        }
      })()

      pendingSavesRef.current.add(task)
      task.finally(() => pendingSavesRef.current.delete(task))
      return task
    },
    [userId, show, ensureWorkout],
  )

  function handleCompleteSet() {
    try { validateSet(state.weight_kg, state.reps, minWeight) }
    catch (e) { show(toMessage(e)); return }
    const id = crypto.randomUUID()
    // Memos are added afterwards by tapping the recorded set.
    const set = nextSet(state, id, null)
    if (set === null) return
    dispatch({ type: 'complete-set', id, note: null })
    void persist(set)
  }

  function handleRetry(setId: string) {
    const target = state.sets.find((s) => s.id === setId)
    if (!target) return
    void persist(target)
  }

  // 保存済みのセットはその場でメモを更新する。未保存（再試行待ち）のセットは、
  // 再試行のときにメモごと保存されるので手元の記録だけ書き換える。
  async function handleNote(setId: string, note: string) {
    const value = note.trim() ? note.trim().slice(0, 200) : null
    if ((statusById[setId] ?? 'saved') === 'saved') {
      await updateSetNote(setId, note)
    }
    dispatch({ type: 'set-note', id: setId, note: value })
  }

  function minWeightFor(exerciseId: string): number {
    return bodyweightIds.includes(exerciseId) && bodyweight !== null ? -bodyweight : 0
  }

  // 一覧入力では、種目を選んだら（今日の記録の読み込みが済んでから）その種目の行を用意する
  useEffect(() => {
    if (loading || picking || mode !== 'list' || !state.currentExerciseId || listRows?.exerciseId === state.currentExerciseId) return
    setListRowsState(rowsFromSets(state.sets, state.currentExerciseId, unit))
    setRowErrors({})
  }, [loading, picking, mode, state, listRows, unit])

  const flushingRef = useRef<Promise<number | null> | null>(null)
  /**
   * 一覧の行をまとめて保存する。記録画面を抜けるとき（種目を変える・記録を終了・ルーティンの移動・
   * 入力方法の切り替え・アプリが裏に回ったとき）に呼ぶ。保存後のセット数を返し、保存できなければ null。
   * background のときは画面を止められないので、打ちかけの行は下書きに残し、保存できる行だけ保存する。
   */
  function flushList(background = false): Promise<number | null> {
    if (!listRows || !userId) return Promise.resolve(state.sets.length)
    if (flushingRef.current) return flushingRef.current
    const { exerciseId, rows } = listRows
    const minWeight = minWeightFor(exerciseId)
    const own = state.sets.filter((s) => s.exercise_id === exerciseId)
    const saved = own.filter((s) => (statusById[s.id] ?? 'saved') === 'saved')
    const plan = planListSave(rows, saved, exerciseId, minWeight, unit)
    if (!background) {
      const errors: Record<string, string> = Object.fromEntries(plan.incomplete.map((id) => [id, '重量と回数の両方を入れてください']))
      if (plan.invalid) errors[plan.invalid.id] = plan.invalid.message
      setRowErrors(errors)
      if (plan.invalid || plan.incomplete.length) {
        show(plan.invalid?.message ?? '重量と回数の両方を入れてください')
        return Promise.resolve(null)
      }
    }
    const total = state.sets.length - own.length + plan.sets.length
    const settle = () => {
      dispatch({ type: 'replace-exercise-sets', exerciseId, sets: plan.sets })
      setStatusById((prev) => {
        const next = { ...prev }
        for (const s of own) delete next[s.id]
        for (const s of plan.sets) next[s.id] = 'saved'
        return next
      })
    }
    // 保存前に行を消した、ダイヤルで失敗したままのセットは、送られないよう印を付ける
    for (const s of own) if (!plan.sets.some((set) => set.id === s.id)) abandonedIdsRef.current.add(s.id)
    if (!plan.upserts.length && !plan.deletes.length) {
      settle()
      return Promise.resolve(total)
    }
    setSavingList(true)
    const task = (async () => {
      try {
        const current = workoutIdRef.current
        if (current !== null) for (const id of plan.deletes) await removeWorkoutSet(current, id)
        if (plan.upserts.length) {
          const wid = await ensureWorkout()
          for (const set of plan.upserts) await saveEditableSet(wid, set, minWeight)
        }
        settle()
        // 最後のセットまで消したら、空のワークアウトもその場で消す（ダイヤルの削除と同じ）
        const wid = workoutIdRef.current
        if (total === 0 && wid !== null) {
          const deleted = await deleteWorkoutIfEmpty(wid).catch((e: unknown) => {
            console.error(`空ワークアウトの削除に失敗しました (workout: ${wid})`, e)
            return false
          })
          if (deleted) {
            setWorkoutId(null)
            workoutCreationRef.current = null
          }
        }
        return total
      } catch (e) {
        if (!background) show(`保存できませんでした。もう一度お試しください（${toMessage(e)}）`)
        return null
      } finally {
        setSavingList(false)
        flushingRef.current = null
      }
    })()
    flushingRef.current = task
    return task
  }

  // iPhoneのホーム画面アプリは、裏に回ったまま終了されることがある。その前に一覧の行を保存する
  const flushRef = useRef(flushList)
  flushRef.current = flushList
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void flushRef.current(true) }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  // プロフィールでダイヤルに戻されたときも、一覧の行を保存してから外す
  useEffect(() => {
    if (mode !== 'dial' || !listRows) return
    void flushRef.current(true).then((total) => { if (total !== null) setListRowsState(null) })
  }, [mode, listRows])

  async function changeExercise() {
    if ((await flushList()) === null) return
    // 今日の記録の画面でセットを消すことがあるので、次に開くときは保存済みのセットから行を作り直す
    setListRowsState(null)
    setManagingGroup(null)
    setChoosingExercise(false)
    setPicking(true)
  }

  // kg／lbsを切り替えたら、打ってある重さもその単位に書き換える（DBにはいつもkgで保存する）
  function changeUnit(next: WeightUnit) {
    if (next === unit) return
    if (listRows) setListRows({ ...listRows, rows: listRows.rows.map((r) => ({ ...r, weight: convertWeightText(r.weight, unit, next) })) })
    setUnit(next)
  }

  // 前回の記録をそのまま行にする。打った行があるときは、置き換えてよいか確かめる
  function copyPrevious() {
    if (!listRows || !previous.workout) return
    if (listRows.rows.some((r) => r.weight.trim() || r.reps.trim()) && !window.confirm('入力中のセットを前回の記録で置き換えますか？')) return
    updateRows(rowsFromPrevious(previous.workout.sets, unit))
  }

  function updateRows(rows: ListRow[]) {
    if (!listRows) return
    setListRows({ ...listRows, rows })
    // 直した行のエラーは消す
    setRowErrors((old) => Object.fromEntries(Object.entries(old).filter(([id]) => rows.some((r) => r.id === id && listRows.rows.find((o) => o.id === id) === r))))
  }

  async function handleDelete(setId: string) {
    if (deletingId) return
    const target = state.sets.find((s) => s.id === setId)
    if (!target) return
    setDeletingId(setId)
    try {
      abandonedIdsRef.current.add(target.id)
      const st = statusById[target.id] ?? 'saved'
      if (st === 'saved') {
        try {
          await deleteSet(target.id)
        } catch (e) {
          // 削除できなかった場合は行を残し、記録が消えたように見せない。
          // まだ本当には取り消されていないので、abandoned の印も取り消す。
          abandonedIdsRef.current.delete(target.id)
          show(toMessage(e))
          return
        }
      }
      // pending / failed のセットは DB にまだコミットされていない（か既に
      // 掃除済みの）ので、ローカルの表示から外すだけでよい。まだ進行中の
      // 保存があれば、上の abandonedIdsRef への追加が persist 側で処理する。
      dispatch({ type: 'remove-set', id: target.id })
      setStatusById((prev) => {
        const next = { ...prev }
        delete next[target.id]
        return next
      })
      // 最後のセットを消したら、空のワークアウトも消す。終了を押すまで
      // 履歴に「0セット」の記録が残らないように。保存中のセットがあれば
      // そちらの結果を待つべきなので、ここでは触らない。
      const wid = workoutIdRef.current
      if (wid !== null && state.sets.every((s) => s.id === target.id) && pendingSavesRef.current.size === 0) {
        const cleanup = deleteWorkoutIfEmpty(wid)
          .then((deleted) => {
            if (!deleted) return
            setWorkoutId(null)
            workoutCreationRef.current = null
          })
          .catch((e: unknown) => console.error(`空ワークアウトの削除に失敗しました (workout: ${wid})`, e))
          .finally(() => { emptyCleanupRef.current = null })
        emptyCleanupRef.current = cleanup
        await cleanup
      }
    } finally {
      setDeletingId(null)
    }
  }

  // エラーはここで握りつぶさず ExercisePicker に伝播させる。ExercisePicker は
  // onCreate の reject を自分でキャッチしてインラインにエラーを表示する
  // （追加フォームを閉じずに再試行できるようにするため）。ここでもトーストを
  // 出すと、ユーザーが見ている場所（フォーム内）に何も表示されないまま
  // 別の場所にエラーが出るという事故になる。
  async function handleCreateExercise(name: string, group: MuscleGroup) {
    if (!userId) throw new Error('サインインしていません')
    const created = await createExercise({ name, muscle_group: group, userId })
    setRoutine(null)
    setExercises((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ja')))
    dispatch({ type: 'select-exercise', exerciseId: created.id, prefill: null })
    setPicking(false)
  }

  async function handleFinish() {
    if (!userId) return
    const total = await flushList()
    if (total === null) return

    // 未保存（保存に失敗した、または保存が確定していない）セットを残したまま
    // 下書きを消してしまうと、その場に立ち会っていない限り気づく手段が無い。
    // 件数を明示して確認する。
    // 一覧入力の種目は上の flushList で保存済み
    const unsavedCount = state.sets.filter((s) => s.exercise_id !== listRows?.exerciseId).filter((s) => {
      const st = statusById[s.id] ?? 'saved'
      return st === 'failed' || st === 'pending'
    }).length
    if (unsavedCount > 0) {
      const proceed = window.confirm(
        `未保存のセットが${unsavedCount}件あります。このまま終了するとその記録は失われます。終了しますか？`,
      )
      if (!proceed) return
    }

    setFinishing(true)
    try {
      // 保存待ち・後片付けの一連の流れ全体に上限時間を設ける。通信が詰まって
      // 戻ってこない場合に画面が「終了中…」のまま動かなくなるのを防ぐため。
      // タイムアウトしても、下書きはローカルに残っているので再訪すれば復帰できる
      // （＝ここで固まり続けるより、進んでしまうほうが安全）。
      await withTimeout(
        (async () => {
          // 保存が進行中のまま空ワークアウト判定に入ると、書き込み中の
          // ワークアウトを消してしまう競合が起きる。すべての進行中の保存が
          // 収まるのを待つ。
          if (pendingSavesRef.current.size > 0) {
            await Promise.allSettled(Array.from(pendingSavesRef.current))
          }
          // workoutId (state) は待機中に更新された可能性があるため、進行中/
          // 完了済みの作成 Promise があればその確定値を使う。無ければ ref の
          // 値をそのまま使う。
          const wid = workoutCreationRef.current
            ? await workoutCreationRef.current.catch(() => null)
            : workoutIdRef.current
          if (wid !== null) {
            try {
              await deleteWorkoutIfEmpty(wid)
            } catch (e) {
              console.error(`空ワークアウトの削除に失敗しました (workout: ${wid})`, e)
            }
          }
        })(),
        10_000,
      )
      clearDraft(userId)
      if (total > 0) markWorkoutFinished(userId)
      onFinished?.()
      navigate('/')
    } finally {
      setFinishing(false)
    }
  }

  if (loading) return <Spinner />
  if (loadError) return <div className="space-y-4 p-4"><p role="alert" className="text-sm text-accent">{loadError}</p><Button onClick={() => setLoadAttempt((n) => n + 1)}>再試行</Button></div>

  // 一覧入力を公開した後に登録した人には、最初に入力方法を選んでもらう
  const modeSheet = shouldAskInputMode(profile?.created_at, chosen) && <BottomSheet title="記録の入れ方を選んでください"
    description="あとからプロフィールの「アプリ設定」で変えられます" dismissible={false} onDismiss={() => {}}>
    <div className="space-y-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {MODES.map(([value, label, description]) => <button key={value} type="button" data-button-key={`choose-${value}-mode`}
        onClick={() => setMode(value)}
        className="flex min-h-14 w-full flex-col items-start rounded-xl border border-border bg-surface px-4 py-3 text-left active:bg-border">
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-muted">{description}</span>
      </button>)}
    </div>
  </BottomSheet>

  const exerciseManager = managingGroup && <>
    <button type="button" onClick={() => setManagingGroup(null)} className="mx-4 min-h-12 text-sm text-muted">← 部位の一覧に戻る</button>
    <ExercisePicker key={managingGroup} exercises={exercises} userId={userId} initialGroup={managingGroup} initialManaging
      onSelect={(e) => { setRoutine(null); selectExercise(e.id) }}
      onCreate={async (name, group) => { await handleCreateExercise(name, group); setManagingGroup(null) }} />
  </>

  // 一覧入力は筋トレMemoと同じく、今日の記録（REC-03）から始まる。右下の＋で種目を選択（REC-04）を開く（まだ記録が無ければ種目選択から）
  if (picking && mode === 'list') {
    return (
      <div className="min-h-full pb-44">
        {modeSheet}
        {offline && <OfflineBanner />}
        {listChoosing ? <>
          {/* 見出しは左に寄せ、操作の説明は右端にそろえて小さく出す */}
          <header className="flex items-center gap-2 px-4 py-1">
            {state.sets.length > 0 && <button type="button" aria-label="戻る" onClick={() => { setChoosingExercise(false); setManagingGroup(null) }}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-fg active:opacity-60">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
            </button>}
            <h1 className={`shrink-0 text-lg font-semibold ${state.sets.length > 0 ? '' : 'py-2'}`}>種目を選択</h1>
            {!managingGroup && <p className="ml-auto min-w-0 text-right text-[10px] leading-tight text-muted">
              <span className="block">← スワイプで非表示</span>
              <span className="block">⠿ 長押しで並び替え</span>
            </p>}
          </header>
          {exerciseManager || <GroupedExercisePicker exercises={exercises} userId={userId}
            onSelect={(e) => { setRoutine(null); selectExercise(e.id) }} onManage={setManagingGroup} />}
        </> : <>
          {/* 筋トレMemoと同じく、左上の「‹」で前の画面（ホーム）に戻り、日付を中央に置く。戻るときは記録を終えたことにする */}
          <header className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center px-4 py-1">
            <button type="button" data-button-key="finish-workout" aria-label="ホームに戻る" onClick={() => void handleFinish()} disabled={finishing}
              className="-ml-2 flex h-11 w-11 items-center justify-center text-fg active:opacity-60 disabled:opacity-40">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
            </button>
            <h1 className="text-center text-lg font-semibold tabular-nums">{finishing ? '保存中…' : localDate().replaceAll('-', '/')}</h1>
            <span />
          </header>
          <TodaySummary sets={state.sets} exerciseNames={exerciseNames} bodyweightIds={bodyweightIds} bodyweight={bodyweight}
            onOpen={(id) => { setRoutine(null); selectExercise(id) }} onDelete={handleDelete} deletingId={deletingId} />
          <AddFab label="種目を追加" onClick={() => setChoosingExercise(true)} disabled={finishing} aboveNavigation />
        </>}
      </div>
    )
  }

  if (picking) {
    return (
      <div className="min-h-full">
        {modeSheet}
        {offline && <OfflineBanner />}
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-muted">{new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{state.sets.length ? '次はどの種目？' : '今日のトレーニング'}</h1>
          </div>
          {state.sets.length > 0 && <button type="button" onClick={() => setPicking(false)} className="min-h-14 px-2 text-sm text-muted">戻る</button>}
          {state.sets.length > 0 && (
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={finishing}
            className="min-h-14 shrink-0 rounded-full border border-accent/50 bg-accent/10 px-4 text-sm font-semibold text-fg active:bg-accent/20 disabled:opacity-40"
          >
            {finishing ? '終了中…' : '記録を終了'}
          </button>
          )}
        </header>
        {userId && <RoutinePanel userId={userId} exercises={exercises}
          onEditingChange={setEditingRoutine}
          onExerciseCreated={(exercise) => setExercises((old) => [...old, exercise])}
          onStart={(selected) => {
            setRoutine({ name: selected.name, exerciseIds: [...selected.exercise_ids], index: 0 })
            selectExercise(selected.exercise_ids[0])
          }} />}
        {!editingRoutine && <ExercisePicker
          exercises={exercises}
          userId={userId}
          onSelect={(e) => {
            setRoutine(null)
            selectExercise(e.id)
          }}
          onCreate={handleCreateExercise}
        />}
      </div>
    )
  }

  const currentName = state.currentExerciseId ? exerciseNames[state.currentExerciseId] : ''
  const editingSet = state.sets.find(set => set.id === editingSetId)

  const listMode = mode === 'list' && listRows !== null && listRows.exerciseId === state.currentExerciseId
  const needsBodyweight = isBodyweight && (bodyweight === null || editingBodyweight)
  const bodyweightForm = <form className="mb-4 space-y-3 rounded-xl border border-border bg-surface p-4" onSubmit={(e) => { e.preventDefault(); void handleSaveBodyweight() }}>
    <p className="text-sm">この種目は「体重＋加重」で負荷を計算します。今日の体重を入力してください。</p>
    <label className="block text-xs text-muted">体重（kg）
      <input type="number" inputMode="decimal" min="20" max="300" step="0.1" required value={bodyweightDraft} disabled={savingBodyweight}
        onChange={(e) => setBodyweightDraft(e.target.value)} className="mt-1 min-h-14 w-full rounded-xl border border-border bg-bg px-4 text-2xl text-fg tabular-nums" />
    </label>
    <p className="text-xs text-muted">体重は自分だけが見られます。</p>
    <Button type="submit" disabled={savingBodyweight}>{savingBodyweight ? '保存中…' : '体重を保存'}</Button>
    {bodyweight !== null && <Button type="button" variant="ghost" disabled={savingBodyweight} onClick={() => setEditingBodyweight(false)}>キャンセル</Button>}
  </form>

  return (
    <div className="flex min-h-[calc(100dvh-10rem-env(safe-area-inset-bottom))] flex-col">
      {modeSheet}
      {offline && <OfflineBanner />}
      {/* 一覧入力の記録入力（REC-05）は今日の記録（REC-03）と同じく、左上の「‹」で保存して戻り、種目名を中央に置く */}
      {listMode && <header ref={recordingHeader} className="sticky top-0 z-20 grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center bg-bg px-4 py-1">
        <button type="button" data-button-key="change-exercise" aria-label="今日の記録に戻る" onClick={() => void changeExercise()} disabled={savingList || finishing}
          className="-ml-2 flex h-11 w-11 items-center justify-center text-fg active:opacity-60 disabled:opacity-40">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <h1 className="break-words text-center text-lg font-semibold">{savingList ? '保存中…' : currentName}</h1>
        <div role="radiogroup" aria-label="重さの単位" className="flex justify-self-end rounded-md bg-accent/20 p-0.5 text-xs">
          {(['kg', 'lbs'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={unit === value}
            disabled={savingList} onClick={() => changeUnit(value)}
            className={`min-h-7 rounded px-1.5 font-semibold ${unit === value ? 'bg-accent text-white' : 'text-accent'}`}>{value}</button>)}
        </div>
      </header>}
      {!listMode && <header ref={recordingHeader} className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-bg px-4 py-2">
        <p className="min-w-0 flex-1 break-words text-lg font-semibold">{currentName}</p>
        {/* 記録の途中でも、この種目の推移を見に行ける。記録画面は裏で保持されるので入力は消えない */}
        {state.currentExerciseId && <Link to={`/exercises/${state.currentExerciseId}`} aria-label={`${currentName}のグラフ`} data-button-key="exercise-graph"
          className="flex min-h-14 shrink-0 items-center gap-1 px-2 text-sm text-muted active:text-fg">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19h16M5 15l4-5 4 3 6-7" />
          </svg>
          グラフ
        </Link>}
        <button
          type="button"
          data-button-key="finish-workout"
          onClick={() => void handleFinish()}
          disabled={finishing || savingList || !!editingSet}
          className="min-h-14 shrink-0 rounded-full border border-accent/50 bg-accent/10 px-4 text-sm font-semibold text-fg active:bg-accent/20 disabled:opacity-40"
        >
          {finishing ? '終了中…' : '記録を終了'}
        </button>
      </header>}
      {routine && <section className="mx-4 mb-3 rounded-xl border border-border bg-surface px-3" aria-label="進行中のルーティン">
        <div className="pt-3 text-sm">{routine.name} <span className="text-muted">{routine.index + 1} / {routine.exerciseIds.length}種目</span></div>
        <div className="flex justify-between gap-2">
          <button className="min-h-14 text-sm text-muted disabled:opacity-30" disabled={routine.index === 0 || !!editingSet} onClick={() => void moveRoutine(-1)}>前の種目</button>
          {routine.index < routine.exerciseIds.length - 1
            ? <button disabled={!!editingSet} className="min-h-14 text-sm text-accent" onClick={() => void moveRoutine(1)}>次の種目へ →</button>
            : <span className="flex min-h-14 items-center text-xs text-muted">最後の種目です</span>}
        </div>
      </section>}

      {userId && state.currentExerciseId && !listMode && <div className="px-4 pt-3">
        <PreviousWorkoutCard key={`${userId}:${state.currentExerciseId}`} userId={userId} exerciseId={state.currentExerciseId} isBodyweight={isBodyweight} />
      </div>}
      {listMode && state.currentExerciseId && <div className="px-4 pb-28 pt-1">
        {needsBodyweight && bodyweightForm}
        {isBodyweight && bodyweight !== null && !editingBodyweight && <p className="mb-2 text-xs text-muted">
          体重 {bodyweight} kg に加重を足して計算します
          <button type="button" className="ml-2 min-h-11 text-accent" onClick={() => { setBodyweightDraft(String(bodyweight)); setEditingBodyweight(true) }}>体重を更新</button>
        </p>}
        <ListPreviousRecord exerciseId={state.currentExerciseId} previous={previous} isBodyweight={isBodyweight} unit={unit} onCopy={copyPrevious}
          disabled={savingList || finishing || needsBodyweight} />
        <ListSetTable exerciseName={currentName} rows={listRows.rows} onChange={updateRows} errors={rowErrors}
          previousFirst={previous.workout ? rowsFromPrevious(previous.workout.sets.slice(0, 1), unit)[0] : null} unit={unit}
          bodyweight={isBodyweight ? { value: bodyweight } : null} disabled={savingList || finishing || needsBodyweight} />
        <AddFab label="セットを追加" disabled={savingList || finishing || needsBodyweight} onClick={() => updateRows([...listRows.rows, newRow()])} />
      </div>}
      {/* 一覧入力では、ほかの種目のセットは今日の記録（REC-03）に出す */}
      {!listMode && <section aria-label="記録済みセット" className="px-4 pb-4 pt-3">
        <SetList
          sets={state.sets}
          activeExerciseId={state.currentExerciseId}
          exerciseNames={exerciseNames}
          status={statusById}
          onDelete={handleDelete}
          onEditNote={setEditingSetId}
          editingId={editingSetId}
          onSaveNote={handleNote}
          onCloseNote={() => setEditingSetId(null)}
          onRetry={handleRetry}
          deletingId={deletingId}
          bodyweightIds={bodyweightIds}
          bodyweight={bodyweight}
        />
      </section>}

      {listMode ? null : editingSet ? <MemoInputSpace /> : <BottomInputDock navigation={false}>
        {/* 体重の入力欄が出るときだけスクロールさせる。ダイヤルの外をなぞってもページは動かさない */}
        <SlidingDial id="recording-dials" contentClassName={`min-h-0 overflow-y-auto overscroll-contain px-4 ${isBodyweight && (bodyweight === null || editingBodyweight) ? 'pt-2' : 'touch-none'}`}>
          {needsBodyweight ? bodyweightForm : <>
          <div className="mb-1 grid grid-cols-2 gap-4">
            <WheelNumber
              label={isBodyweight ? '加重' : '重量'}
              hideLabel
              value={state.weight_kg}
              unit="kg"
              min={minWeight}
              format={isBodyweight ? formatAddedLoad : undefined}
              step={dialStep}
              onEnter={(value) => dispatch({ type: 'set-weight', value, min: minWeight, history, loadOffset })}
            />
            <WheelNumber
              label="回数"
              hideLabel
              value={state.reps}
              unit="回"
              min={0}
              onEnter={(value) => dispatch({ type: 'set-reps', value })}
            />
          </div>
          <SetRmLabel load={load} reps={state.reps} />
          {isBodyweight && bodyweight !== null && <p className="mb-2 text-center text-xs text-muted">
            体重 {bodyweight} kg {formatAddedLoad(state.weight_kg) === '自重' ? '' : formatAddedLoad(state.weight_kg).replace('+', '＋ ').replace('−', '− ')} ＝ 総重量 <strong className="text-fg tabular-nums">{load} kg</strong>
            <button type="button" className="ml-2 min-h-14 text-accent" onClick={() => { setBodyweightDraft(String(bodyweight)); setEditingBodyweight(true) }}>体重を更新</button>
          </p>}
          </>}
        </SlidingDial>
        <div className="flex shrink-0 gap-2 px-4 pb-3 pt-2">
          <button type="button" data-button-key="change-exercise" onClick={() => void changeExercise()} className="min-h-14 shrink-0 self-center rounded-xl border border-border px-4 text-sm font-semibold text-fg active:bg-border">種目を変える</button>
          <Button size="lg" data-button-key="complete-set" className="min-w-0" onClick={handleCompleteSet} disabled={offline || finishing || (isBodyweight && (bodyweight === null || editingBodyweight))}>
            {offline ? 'オフラインでは保存できません' : justSaved ? '✓ 記録しました' : 'セット完了'}
          </Button>
        </div>
      </BottomInputDock>}
    </div>
  )
}
