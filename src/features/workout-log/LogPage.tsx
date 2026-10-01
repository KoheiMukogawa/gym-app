import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findPrefill } from '../../lib/calc'
import { validateSet } from '../../lib/dates'
import { isOffline, toMessage } from '../../lib/errors'
import type { Exercise, MuscleGroup, WorkoutSet } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { NumberStepper } from '../../components/ui/NumberStepper'
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
  fetchUserSetHistory,
  saveSet,
} from './queries'
import { SetList } from './SetList'

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

export function LogPage({ home = false }: { home?: boolean }) {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()

  // マウントごとに1回だけ読む。モジュールスコープに置くと、終了後に開き直した際に
  // 破棄済みの下書きを復元してしまう。
  const [draft] = useState(() => (userId ? loadDraft(userId) : null))

  const [state, dispatch] = useReducer(logReducer, draft?.state ?? initialLogState)
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [picking, setPicking] = useState(draft?.state.currentExerciseId == null)
  const [justSaved, setJustSaved] = useState(false)
  const [offline, setOffline] = useState(isOffline())
  const [finishing, setFinishing] = useState(false)
  const [undoing, setUndoing] = useState(false)

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

  // 認証切れやリロードで画面が失われても記録を復元できるよう、変更のたびに退避する。
  // workoutId は state 化したので、作成直後の値も取りこぼさずに書き込まれる。
  useEffect(() => {
    if (!userId) return
    saveDraft(userId, { state, workoutId, status: statusById, routine })
  }, [state, workoutId, statusById, userId, routine])

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
    Promise.all([fetchExercises(), fetchUserSetHistory(userId)])
      .then(([ex, hist]) => {
        if (!active) return
        setExercises(ex)
        setHistory(hist)
      })
      .catch((e) => { if (active) setLoadError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, loadAttempt])

  const exerciseNames = Object.fromEntries(exercises.map((e) => [e.id, exerciseLabel(e)]))

  function selectExercise(exerciseId: string) {
    dispatch({ type: 'select-exercise', exerciseId, prefill: findPrefill(history, exerciseId) })
    setPicking(false)
  }
  function moveRoutine(direction: -1 | 1) {
    if (!routine) return
    const index = routine.index + direction
    if (index < 0 || index >= routine.exerciseIds.length) return
    const id = routine.exerciseIds[index]
    if (!exercises.some((e) => e.id === id)) { show('この種目は見つかりません。ルーティンを編集してください。'); return }
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
        // workoutId は state ではなく ref から読む。この関数オブジェクト自体は
        // 過去のレンダー（例: 失敗トーストが捕まえた古い persist）から
        // 再利用されることがあるが、ref は常に最新の値を指す。
        let wid = workoutIdRef.current
        try {
          if (wid === null) {
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
            wid = await workoutCreationRef.current
          }
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
    [userId, show],
  )

  function handleCompleteSet() {
    try { validateSet(state.weight_kg, state.reps) }
    catch (e) { show(toMessage(e)); return }
    const id = crypto.randomUUID()
    const set = nextSet(state, id)
    if (set === null) return
    dispatch({ type: 'complete-set', id })
    void persist(set)
  }

  function handleRetry(setId: string) {
    const target = state.sets.find((s) => s.id === setId)
    if (!target) return
    void persist(target)
  }

  async function handleUndo() {
    if (undoing) return
    const last = state.sets[state.sets.length - 1]
    if (!last) return
    setUndoing(true)
    try {
      abandonedIdsRef.current.add(last.id)
      const st = statusById[last.id] ?? 'saved'
      if (st === 'saved') {
        try {
          await deleteSet(last.id)
        } catch (e) {
          // 削除できなかった場合は行を残し、記録が消えたように見せない。
          // まだ本当には取り消されていないので、abandoned の印も取り消す。
          abandonedIdsRef.current.delete(last.id)
          show(toMessage(e))
          return
        }
      }
      // pending / failed のセットは DB にまだコミットされていない（か既に
      // 掃除済みの）ので、ローカルの表示から外すだけでよい。まだ進行中の
      // 保存があれば、上の abandonedIdsRef への追加が persist 側で処理する。
      dispatch({ type: 'undo-last-set' })
      setStatusById((prev) => {
        const next = { ...prev }
        delete next[last.id]
        return next
      })
    } finally {
      setUndoing(false)
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

    // 未保存（保存に失敗した、または保存が確定していない）セットを残したまま
    // 下書きを消してしまうと、その場に立ち会っていない限り気づく手段が無い。
    // 件数を明示して確認する。
    const unsavedCount = state.sets.filter((s) => {
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
      navigate(home ? '/history' : '/')
    } finally {
      setFinishing(false)
    }
  }

  if (loading) return <Spinner />
  if (loadError) return <div className="space-y-4 p-4"><p role="alert" className="text-sm text-accent">{loadError}</p><Button onClick={() => setLoadAttempt((n) => n + 1)}>再試行</Button></div>

  if (picking) {
    return (
      <div className="min-h-full">
        {offline && <OfflineBanner />}
        <header className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="mb-1 text-xs text-muted">{new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{state.sets.length ? '次はどの種目？' : '今日のトレーニング'}</h1>
            <p className="mt-2 text-sm text-muted">種目を選んで、そのまま記録。</p>
          </div>
          {state.sets.length > 0 && <button type="button" onClick={() => setPicking(false)} className="min-h-14 px-2 text-sm text-muted">戻る</button>}
          {state.sets.length > 0 && (
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={finishing}
            className="min-h-14 px-2 text-sm text-muted disabled:opacity-40"
          >
            {finishing ? '終了中…' : '終了'}
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

  return (
    <div className="flex min-h-full flex-col">
      {offline && <OfflineBanner />}
      <header className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={() => setPicking(true)} className="min-h-14 text-left">
          <span className="text-lg font-semibold">{currentName}</span>
          <span className="ml-2 text-xs text-muted">種目を変える</span>
        </button>
        <button
          type="button"
          onClick={() => void handleFinish()}
          disabled={finishing}
          className="min-h-14 px-2 text-sm text-muted disabled:opacity-40"
        >
          {finishing ? '終了中…' : '終了'}
        </button>
      </header>
      {routine && <section className="mx-4 mb-3 rounded-xl border border-border bg-surface px-3" aria-label="進行中のルーティン">
        <div className="pt-3 text-sm">{routine.name} <span className="text-muted">{routine.index + 1} / {routine.exerciseIds.length}種目</span></div>
        <div className="flex justify-between gap-2">
          <button className="min-h-14 text-sm text-muted disabled:opacity-30" disabled={routine.index === 0} onClick={() => moveRoutine(-1)}>前の種目</button>
          {routine.index < routine.exerciseIds.length - 1
            ? <button className="min-h-14 text-sm text-accent" onClick={() => moveRoutine(1)}>次の種目へ →</button>
            : <span className="flex min-h-14 items-center text-xs text-muted">最後の種目です</span>}
        </div>
      </section>}

      <div className="flex-1 overflow-y-auto px-4 pb-[26rem]">
        <SetList
          sets={state.sets}
          exerciseNames={exerciseNames}
          status={statusById}
          onUndo={() => void handleUndo()}
          onRetry={handleRetry}
          undoing={undoing}
        />
      </div>

      <div className={`fixed inset-x-0 mx-auto max-w-lg border-t border-border bg-bg px-4 pb-4 pt-4 ${home ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))]' : 'bottom-0'}`}>
        <div className="mb-4 flex flex-col gap-4">
          <NumberStepper
            direct
            label="重量"
            value={state.weight_kg}
            unit="kg"
            onStep={(direction) => dispatch({ type: 'adjust-weight', direction })}
            onEnter={(value) => dispatch({ type: 'set-weight', value })}
          />
          <NumberStepper
            direct
            label="回数"
            value={state.reps}
            unit="回"
            onStep={(direction) => dispatch({ type: 'adjust-reps', direction })}
            onEnter={(value) => dispatch({ type: 'set-reps', value })}
          />
        </div>
        <Button size="lg" onClick={handleCompleteSet} disabled={offline || finishing}>
          {offline ? 'オフラインでは保存できません' : justSaved ? '✓ 記録しました' : 'セット完了'}
        </Button>
      </div>
    </div>
  )
}
