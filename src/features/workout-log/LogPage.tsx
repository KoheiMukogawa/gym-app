import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findPrefill } from '../../lib/calc'
import { isOffline, toMessage } from '../../lib/errors'
import type { Exercise, MuscleGroup, WorkoutSet } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { NumberStepper } from '../../components/ui/NumberStepper'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { useSession } from '../auth/SessionProvider'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { createExercise, fetchExercises, fetchRecentExerciseIds } from '../exercises/queries'
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

export function LogPage() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()

  // マウントごとに1回だけ読む。モジュールスコープに置くと、終了後に開き直した際に
  // 破棄済みの下書きを復元してしまう。
  const [draft] = useState(() => (userId ? loadDraft(userId) : null))

  const [state, dispatch] = useReducer(logReducer, draft?.state ?? initialLogState)
  const [workoutId, setWorkoutId] = useState<string | null>(draft?.workoutId ?? null)
  const [statusById, setStatusById] = useState<Record<string, SetStatus>>(draft?.status ?? {})
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [history, setHistory] = useState<Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[]>([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(draft?.state.currentExerciseId == null)
  const [justSaved, setJustSaved] = useState(false)
  const [offline, setOffline] = useState(isOffline())
  const [finishing, setFinishing] = useState(false)

  // ワークアウト作成の二重発行を防ぐための、進行中の作成 Promise。
  // 1件目の呼び出しがこれを埋め、以降の呼び出しは同じ Promise を待つだけにする。
  const workoutCreationRef = useRef<Promise<string> | null>(null)
  // 現在進行中の保存（作成＋セット保存）を追跡する。終了処理がこれの完了を
  // 待ってからワークアウトの掃除に入ることで、保存中のワークアウトを
  // 削除してしまう競合を防ぐ。
  const pendingSavesRef = useRef<Set<Promise<void>>>(new Set())
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 認証切れやリロードで画面が失われても記録を復元できるよう、変更のたびに退避する。
  // workoutId は state 化したので、作成直後の値も取りこぼさずに書き込まれる。
  useEffect(() => {
    if (!userId) return
    saveDraft(userId, { state, workoutId, status: statusById })
  }, [state, workoutId, statusById, userId])

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
    Promise.all([fetchExercises(), fetchRecentExerciseIds(userId), fetchUserSetHistory(userId)])
      .then(([ex, recent, hist]) => {
        setExercises(ex)
        setRecentIds(recent)
        setHistory(hist)
      })
      .catch((e) => show(toMessage(e)))
      .finally(() => setLoading(false))
  }, [userId, show])

  const exerciseNames = Object.fromEntries(exercises.map((e) => [e.id, e.name]))

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
      setStatusById((prev) => ({ ...prev, [set.id]: 'pending' }))

      const task = (async () => {
        let wid = workoutId
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
          setStatusById((prev) => ({ ...prev, [set.id]: 'saved' }))
          showJustSaved()
        } catch (e) {
          setStatusById((prev) => ({ ...prev, [set.id]: 'failed' }))
          // このセットの保存に失敗した時点で他に進行中の保存がなければ、
          // ワークアウトはまだ空である可能性が高い。終了を待たず掃除する。
          // pendingSavesRef にはこのタスク自身がまだ含まれているので、
          // サイズが1（自分だけ）のときだけ安全に判断できる。
          if (wid !== null && pendingSavesRef.current.size <= 1) {
            try {
              await deleteWorkoutIfEmpty(wid)
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
    [userId, show, workoutId],
  )

  function handleCompleteSet() {
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
    const last = state.sets[state.sets.length - 1]
    if (!last) return
    const st = statusById[last.id] ?? 'saved'
    if (st === 'saved') {
      try {
        await deleteSet(last.id)
      } catch (e) {
        // 削除できなかった場合は行を残し、記録が消えたように見せない
        show(toMessage(e))
        return
      }
    }
    // pending / failed のセットは DB にまだコミットされていない（か既に
    // 掃除済みの）ので、ローカルの表示から外すだけでよい。
    dispatch({ type: 'undo-last-set' })
    setStatusById((prev) => {
      const next = { ...prev }
      delete next[last.id]
      return next
    })
  }

  // エラーはここで握りつぶさず ExercisePicker に伝播させる。ExercisePicker は
  // onCreate の reject を自分でキャッチしてインラインにエラーを表示する
  // （追加フォームを閉じずに再試行できるようにするため）。ここでもトーストを
  // 出すと、ユーザーが見ている場所（フォーム内）に何も表示されないまま
  // 別の場所にエラーが出るという事故になる。
  async function handleCreateExercise(name: string, group: MuscleGroup) {
    if (!userId) throw new Error('サインインしていません')
    const created = await createExercise({ name, muscle_group: group, userId })
    setExercises((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ja')))
    dispatch({ type: 'select-exercise', exerciseId: created.id, prefill: null })
    setPicking(false)
  }

  async function handleFinish() {
    if (!userId) return
    setFinishing(true)
    try {
      // 保存が進行中のまま空ワークアウト判定に入ると、書き込み中のワークアウトを
      // 消してしまう競合が起きる。すべての進行中の保存が収まるのを待つ。
      if (pendingSavesRef.current.size > 0) {
        await Promise.allSettled(Array.from(pendingSavesRef.current))
      }
      // workoutId (state) は待機中に更新された可能性があるため、進行中/完了済みの
      // 作成 Promise があればその確定値を使う。無ければ state の値をそのまま使う。
      const wid = workoutCreationRef.current
        ? await workoutCreationRef.current.catch(() => null)
        : workoutId
      if (wid !== null) {
        try {
          await deleteWorkoutIfEmpty(wid)
        } catch (e) {
          console.error(`空ワークアウトの削除に失敗しました (workout: ${wid})`, e)
        }
      }
      clearDraft(userId)
      navigate('/')
    } finally {
      setFinishing(false)
    }
  }

  if (loading) return <Spinner />

  if (picking) {
    return (
      <div className="min-h-full">
        {offline && <OfflineBanner />}
        <header className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">種目を選ぶ</h1>
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={finishing}
            className="min-h-14 px-2 text-sm text-muted disabled:opacity-40"
          >
            {finishing ? '終了中…' : '終了'}
          </button>
        </header>
        <ExercisePicker
          exercises={exercises}
          recentIds={recentIds}
          onSelect={(e) => {
            dispatch({
              type: 'select-exercise',
              exerciseId: e.id,
              prefill: findPrefill(history, e.id),
            })
            setPicking(false)
          }}
          onCreate={handleCreateExercise}
        />
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

      <div className="flex-1 overflow-y-auto px-4 pb-80">
        <SetList
          sets={state.sets}
          exerciseNames={exerciseNames}
          status={statusById}
          onUndo={() => void handleUndo()}
          onRetry={handleRetry}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mb-4 flex flex-col gap-4">
          <NumberStepper
            label="重量"
            value={state.weight_kg}
            unit="kg"
            onStep={(direction) => dispatch({ type: 'adjust-weight', direction })}
            onEnter={(value) => dispatch({ type: 'set-weight', value })}
          />
          <NumberStepper
            label="回数"
            value={state.reps}
            unit="回"
            onStep={(direction) => dispatch({ type: 'adjust-reps', direction })}
            onEnter={(value) => dispatch({ type: 'set-reps', value })}
          />
        </div>
        <Button size="lg" onClick={handleCompleteSet} disabled={offline}>
          {offline ? 'オフラインでは保存できません' : justSaved ? '✓ 記録しました' : 'セット完了'}
        </Button>
      </div>
    </div>
  )
}
