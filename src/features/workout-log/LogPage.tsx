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
import { clearDraft, loadDraft, saveDraft } from './persistence'
import { createWorkout, deleteWorkoutIfEmpty, fetchUserSetHistory, saveSet } from './queries'
import { SetList } from './SetList'

export function LogPage() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()

  // マウントごとに1回だけ読む。モジュールスコープに置くと、終了後に開き直した際に
  // 破棄済みの下書きを復元してしまう。
  const [draft] = useState(loadDraft)

  const [state, dispatch] = useReducer(logReducer, draft?.state ?? initialLogState)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [history, setHistory] = useState<Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps'>[]>([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(draft?.state.currentExerciseId == null)
  const [justSaved, setJustSaved] = useState(false)
  const [offline, setOffline] = useState(isOffline())

  // ワークアウトは最初のセット保存時に作る。開いただけの空記録を残さないため。
  const workoutIdRef = useRef<string | null>(draft?.workoutId ?? null)

  // 認証切れやリロードで画面が失われても記録を復元できるよう、変更のたびに退避する
  useEffect(() => {
    saveDraft({ state, workoutId: workoutIdRef.current })
  }, [state])

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

  const persist = useCallback(
    async (set: LoggedSet) => {
      if (!userId) return
      try {
        if (workoutIdRef.current === null) {
          const workout = await createWorkout(userId)
          workoutIdRef.current = workout.id
        }
        await saveSet(workoutIdRef.current, set)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 1200)
      } catch (e) {
        show(toMessage(e), { label: '再試行', onClick: () => void persist(set) })
      }
    },
    [userId, show],
  )

  function handleCompleteSet() {
    const set = nextSet(state)
    if (set === null) return
    dispatch({ type: 'complete-set' })
    void persist(set)
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
    if (workoutIdRef.current !== null) {
      try {
        await deleteWorkoutIfEmpty(workoutIdRef.current)
      } catch {
        // 空ワークアウトの掃除が失敗しても記録の妨げにはならないため、握りつぶす
      }
    }
    clearDraft()
    navigate('/')
  }

  if (loading) return <Spinner />

  if (picking) {
    return (
      <div className="min-h-full">
        <header className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">種目を選ぶ</h1>
          <button type="button" onClick={() => void handleFinish()} className="min-h-14 px-2 text-sm text-muted">
            終了
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
      {offline && (
        <p role="alert" className="bg-accent px-4 py-2 text-center text-sm text-white">
          オフラインです。記録は保存できません。
        </p>
      )}
      <header className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={() => setPicking(true)} className="min-h-14 text-left">
          <span className="text-lg font-semibold">{currentName}</span>
          <span className="ml-2 text-xs text-muted">種目を変える</span>
        </button>
        <button type="button" onClick={() => void handleFinish()} className="min-h-14 px-2 text-sm text-muted">
          終了
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-56">
        <SetList
          sets={state.sets}
          exerciseNames={exerciseNames}
          onUndo={() => dispatch({ type: 'undo-last-set' })}
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
        <Button size="lg" onClick={handleCompleteSet}>
          {justSaved ? '✓ 記録しました' : 'セット完了'}
        </Button>
      </div>
    </div>
  )
}
