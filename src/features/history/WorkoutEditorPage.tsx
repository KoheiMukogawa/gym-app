import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { localDate, validateSet, workoutDateISO } from '../../lib/dates'
import { InputError, toMessage } from '../../lib/errors'
import type { Exercise, MuscleGroup, WorkoutSet } from '../../lib/types'
import { useSession } from '../auth/SessionProvider'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { exerciseLabel } from '../exercises/catalog'
import { createExercise, fetchExercises } from '../exercises/queries'
import { loadDraft, clearDraft } from '../workout-log/persistence'
import { SwipeRow } from '../../components/SwipeRow'
import { bodyweightOn, formatAddedLoad, type BodyweightLog } from '../../lib/bodyweight'
import { fetchBodyweightLogs } from '../profile/bodyweightQueries'
import { createDatedWorkout, fetchEditableWorkout, findWorkoutOnDate, removeWorkout, removeWorkoutSet, saveEditableSet, updateWorkoutDate, updateWorkoutSet } from './editorQueries'

type Entry = { id: string; exercise_id: string; weight: string; reps: string; existing: boolean }
const fieldClass = 'min-h-14 min-w-0 w-full rounded-xl border border-border bg-bg px-3 text-lg tabular-nums'

export function WorkoutEditorPage() {
  const { workoutId } = useParams()
  const [params] = useSearchParams()
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()
  const newId = useRef(crypto.randomUUID())
  const [savedId, setSavedId] = useState<string | null>(workoutId ?? null)
  const [date, setDate] = useState(() => {
    const value = params.get('date')
    try { if (value) { workoutDateISO(value); return value } } catch { /* Use today for invalid links. */ }
    return localDate()
  })
  const [savedDate, setSavedDate] = useState<string | null>(null)
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [entry, setEntry] = useState<Entry | null>(null)
  const drafts = useRef<Record<string, Entry>>({})
  const [picking, setPicking] = useState(!workoutId)
  const lock = useRef(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadError(null)
    try {
      const [all, workout, logs] = await Promise.all([
        fetchExercises(), workoutId ? fetchEditableWorkout(userId, workoutId) : Promise.resolve(null), fetchBodyweightLogs(userId),
      ])
      setExercises(all)
      setBodyweightLogs(logs)
      setNotFound(!!workoutId && !workout)
      if (workout) {
        setSavedId(workout.id)
        setSavedDate(workout.performed_at)
        setDate(localDate(workout.performed_at))
        setSets(workout.workout_sets.sort((a, b) => a.created_at.localeCompare(b.created_at)))
      }
    } catch (e) { setLoadError(toMessage(e)) }
    finally { setLoading(false) }
  }, [userId, workoutId])
  useEffect(() => { void load() }, [load])

  // Warn before a reload while a form or request is still in progress.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (entry || Object.keys(drafts.current).length || busy || (savedDate && date !== localDate(savedDate))) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [entry, busy, savedDate, date])

  function invalidateDraft() {
    if (userId && savedId && loadDraft(userId)?.workoutId === savedId) clearDraft(userId)
  }
  async function action(task: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    try { await task() }
    catch (e) { setError(toMessage(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  function choose(exercise: Exercise) {
    const previous = [...sets].reverse().find((s) => s.exercise_id === exercise.id)
    setEntry((old) => old ? { ...old, exercise_id: exercise.id } : {
      id: crypto.randomUUID(), exercise_id: exercise.id,
      weight: String(previous?.weight_kg ?? 20), reps: String(previous?.reps ?? 10), existing: false,
    })
    setPicking(false)
    setError(null)
  }
  function editSet(set: WorkoutSet) {
    if (entry?.id === set.id) { setPicking(false); return }
    if (entry) drafts.current[entry.id] = entry
    setEntry(drafts.current[set.id] ?? {
      id: set.id, exercise_id: set.exercise_id, weight: String(set.weight_kg), reps: String(set.reps), existing: true,
    })
    setPicking(false)
    setError(null)
  }
  async function create(name: string, group: MuscleGroup) {
    if (!userId) throw new Error('ログインしてください')
    const exercise = await createExercise({ name, muscle_group: group, userId })
    setExercises((old) => [...old, exercise])
    choose(exercise)
  }
  async function saveEntry() {
    if (!entry || !userId) return
    await action(async () => {
      if (!entry.weight.trim() || !entry.reps.trim()) throw new InputError('重量と回数を入力してください')
      const weight_kg = Number(entry.weight)
      const reps = Number(entry.reps)
      validateSet(weight_kg, reps, minWeightFor(entry.exercise_id))
      workoutDateISO(date)
      let id = savedId
      let known = sets
      if (!id) {
        // One workout per day: add to the day's existing record when there is one.
        id = await findWorkoutOnDate(userId, date)
        if (id) known = (await fetchEditableWorkout(userId, id))?.workout_sets ?? []
        else {
          id = newId.current
          await createDatedWorkout(userId, id, date)
        }
        setSavedId(id)
        setSavedDate(workoutDateISO(date))
      } else if (savedDate && date !== localDate(savedDate)) {
        throw new InputError('先に日付の変更を保存してください')
      }
      const old = sets.find((s) => s.id === entry.id)
      const set_index = old?.exercise_id === entry.exercise_id ? old.set_index
        : 1 + Math.max(0, ...known.filter((s) => s.exercise_id === entry.exercise_id).map((s) => s.set_index))
      const next: WorkoutSet = {
        id: entry.id, workout_id: id, exercise_id: entry.exercise_id, weight_kg, reps, set_index,
        created_at: old?.created_at ?? new Date().toISOString(),
      }
      if (entry.existing) await updateWorkoutSet(id, next)
      else await saveEditableSet(id, next)
      setSets((items) => entry.existing ? items.map((s) => s.id === next.id ? next : s) : [...items, next])
      invalidateDraft()
      show(entry.existing ? '記録を修正しました' : 'セットを追加しました')
      delete drafts.current[entry.id]
      setEntry(null)
      if (!workoutId) navigate('/history/' + id, { replace: true })
    })
  }

  function isBodyweightExercise(id: string) {
    return exercises.some((e) => e.id === id && e.is_bodyweight)
  }
  // 自重種目は、その日の体重分までアシスト（マイナス）を入力できる
  function minWeightFor(id: string) {
    const bw = isBodyweightExercise(id) ? bodyweightOn(bodyweightLogs, date) : null
    return bw === null ? 0 : -bw
  }
  function loadLabel(set: Pick<WorkoutSet, 'exercise_id' | 'weight_kg'>) {
    return isBodyweightExercise(set.exercise_id) ? formatAddedLoad(set.weight_kg) : `${set.weight_kg} kg`
  }
  async function deleteSet(set: WorkoutSet) {
    await action(async () => {
      await removeWorkoutSet(savedId!, set.id)
      setSets((old) => old.filter((s) => s.id !== set.id))
      invalidateDraft()
    })
  }

  if (loading) return <Spinner />
  if (loadError) return <div className="space-y-4 p-4"><p role="alert">{loadError}</p><Button onClick={() => void load()}>再試行</Button></div>
  if (notFound) return <div className="p-4"><p role="alert">この記録は見つからないか、編集できません。</p><Link className="flex min-h-14 items-center text-accent" to="/history">履歴へ戻る</Link></div>
  const names = Object.fromEntries(exercises.map((e) => [e.id, exerciseLabel(e)]))
  const groups = [...new Set(sets.map((s) => s.exercise_id))].map((id) => ({ id, sets: sets.filter((s) => s.exercise_id === id) }))
  const entryIsBodyweight = !!entry && isBodyweightExercise(entry.exercise_id)

  return (
    <div className="flex flex-col gap-5 py-4">
      <header className="flex items-center justify-between px-4">
        <h1 className="text-2xl font-semibold">{workoutId ? '記録を編集' : '日付を選んで記録'}</h1>
        <button className="min-h-14 px-3 text-sm text-muted" disabled={busy}
          onClick={() => {
            if ((entry || Object.keys(drafts.current).length) && !window.confirm('入力中のセットは保存されません。履歴に戻りますか？')) return
            if (savedDate && date !== localDate(savedDate) && !window.confirm('日付の変更は保存されません。履歴に戻りますか？')) return
            navigate('/history?date=' + date)
          }}>完了</button>
      </header>
      <section className="mx-4 space-y-3 rounded-2xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-2 text-sm text-muted">トレーニング日
          <input type="date" value={date} max={localDate()} disabled={busy} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </label>
        {savedId && savedDate && date !== localDate(savedDate) && (
          <Button disabled={busy} onClick={() => void action(async () => {
            if (await findWorkoutOnDate(userId!, date, savedId)) throw new InputError('この日にはすでに記録があります。その日の記録に追加してください')
            const value = await updateWorkoutDate(userId!, savedId, date, savedDate)
            setSavedDate(value)
            invalidateDraft()
            show('日付を変更しました')
          })}>日付の変更を保存</Button>
        )}
      </section>
      {error && <p role="alert" className="px-4 text-sm text-accent">{error}</p>}
      <section className="flex flex-col gap-3 px-4" aria-label="保存済みのセット">
        {groups.map((group) => (
          <section key={group.id} className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold">{names[group.id] ?? '種目'}</h2>
            <ul className="divide-y divide-border">
              {group.sets.map((set) => (
                <SwipeRow key={set.id} label={(names[set.exercise_id] ?? '種目') + ' ' + loadLabel(set).replace(' ', '') + ' ' + set.reps + '回を削除'}
                  disabled={busy || !!entry || !!drafts.current[set.id]} onDelete={() => deleteSet(set)}>
                  <button type="button" disabled={busy} className="flex min-h-12 flex-1 items-center justify-between text-left" aria-pressed={entry?.id === set.id}
                    aria-label={(names[set.exercise_id] ?? '種目') + ' ' + loadLabel(set).replace(' ', '') + ' ' + set.reps + '回を編集'}
                    onClick={() => editSet(set)}>
                    <span className="text-lg font-semibold tabular-nums">{loadLabel(set)} <span className="text-xs font-normal text-muted">×</span> {set.reps} <span className="text-xs font-normal text-muted">回</span></span>
                    {(entry?.id === set.id || drafts.current[set.id]) && <span className="text-xs text-accent">{entry?.id === set.id ? '編集中' : '未保存'}</span>}
                  </button>
                </SwipeRow>
              ))}
            </ul>
          </section>
        ))}
        {sets.length > 0 && <p className="text-center text-xs text-muted">セットをタップで編集、左にスワイプで削除</p>}
        {sets.length === 0 && !picking && !entry && <p className="py-4 text-sm text-muted">セットがありません。種目を選んで追加できます。</p>}
      </section>
      {Object.values(drafts.current).filter((draft) => !draft.existing && draft.id !== entry?.id).map((draft) =>
        <button key={draft.id} className="mx-4 min-h-14 rounded-xl border border-border text-sm" disabled={busy} onClick={() => {
          if (entry) drafts.current[entry.id] = entry
          setEntry(draft); setPicking(false); setError(null)
        }}>{names[draft.exercise_id]}の追加を続ける（未保存）</button>)}
      {picking && <ExercisePicker exercises={exercises} recentIds={[...new Set([...sets].reverse().map((s) => s.exercise_id))]} userId={userId} onSelect={choose} onCreate={create} />}
      {entry && !picking && (
        <form className="mx-4 space-y-4 rounded-2xl border border-accent/40 bg-surface p-4"
          onSubmit={(e) => { e.preventDefault(); void saveEntry() }}>
          <button type="button" disabled={busy} onClick={() => setPicking(true)} className="min-h-14 w-full text-left font-semibold">
            {names[entry.exercise_id]} <span className="text-xs font-normal text-muted">種目を変更</span>
          </button>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm text-muted">{entryIsBodyweight ? '加重（kg）' : '重量（kg）'}
              <input type="number" inputMode="decimal" min={minWeightFor(entry.exercise_id)} max="9999.9" step="0.1" required disabled={busy}
                value={entry.weight} onChange={(e) => setEntry({ ...entry, weight: e.target.value })} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-2 text-sm text-muted">回数
              <input type="number" inputMode="numeric" min="1" max="9999" step="1" required disabled={busy}
                value={entry.reps} onChange={(e) => setEntry({ ...entry, reps: e.target.value })} className={fieldClass} />
            </label>
          </div>
          {entryIsBodyweight && <p className="text-xs text-muted">{minWeightFor(entry.exercise_id) < 0 ? '自重のみは0、加重はプラス、アシストはマイナスで入力します。' : '自重のみは0、加重はプラスで入力します。体重を記録するとアシスト（マイナス）も入力できます。'}</p>}
          <Button type="submit" disabled={busy}>{busy ? '保存中…' : entry.existing ? '変更を保存' : 'セットを追加'}</Button>
        </form>
      )}
      {(entry || picking) ? <button className="mx-4 min-h-14 text-sm text-muted" disabled={busy}
        onClick={() => { if (entry) delete drafts.current[entry.id]; setEntry(null); setPicking(false); setError(null) }}>キャンセル</button>
        : <div className="px-4"><Button variant="ghost" onClick={() => setPicking(true)}>＋ セットを追加</Button></div>}
      {savedId && <button disabled={busy || !!entry || Object.keys(drafts.current).length > 0} className="mx-4 mt-4 min-h-14 text-sm text-accent"
        onClick={() => { if (window.confirm('この日のトレーニング記録を削除しますか？')) void action(async () => {
          await removeWorkout(userId!, savedId)
          invalidateDraft()
          navigate('/history?date=' + date)
        }) }}>この記録を削除</button>}
    </div>
  )
}
