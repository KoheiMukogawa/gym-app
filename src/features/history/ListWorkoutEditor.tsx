import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../components/ui/Toast'
import { bodyweightOn, type BodyweightLog } from '../../lib/bodyweight'
import { toMessage } from '../../lib/errors'
import type { Exercise, MuscleGroup, WorkoutSet } from '../../lib/types'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { exerciseLabel } from '../exercises/catalog'
import { AddFab } from '../workout-log/AddFab'
import { GroupedExercisePicker } from '../workout-log/GroupedExercisePicker'
import { ListSetTable } from '../workout-log/ListSetTable'
import { isIncompleteRow, newRow, planListSave, rowsFromSets, withDefaultRows, type ListRow } from '../workout-log/listRows'
import type { LoggedSet } from '../workout-log/logReducer'
import { deleteWorkoutIfEmpty } from '../workout-log/queries'
import { convertWeightText, useWeightUnit, type WeightUnit } from '../workout-log/weightUnit'
import { createDatedWorkout, findWorkoutOnDate, removeWorkout, removeWorkoutSet, saveEditableSet } from './editorQueries'

type Props = {
  userId: string
  /** 開いた記録のID。新しい日の記録（HIS-03）では無い */
  workoutId: string | null
  /** 新しい記録を作るときに使うID（作り直しても同じ記録になるように） */
  newWorkoutId: string
  date: string
  initialSets: WorkoutSet[]
  exercises: Exercise[]
  bodyweightLogs: BodyweightLog[]
  onCreateExercise: (name: string, group: MuscleGroup) => Promise<Exercise>
  /** 保存したら、記録画面の下書き（同じ記録のもの）を捨てる */
  onSaved: (workoutId: string) => void
}

function toLogged(set: WorkoutSet): LoggedSet {
  return { id: set.id, exercise_id: set.exercise_id, set_index: set.set_index, weight_kg: set.weight_kg, reps: set.reps, ...(set.note ? { note: set.note } : {}) }
}

/**
 * 履歴の編集（HIS-02・HIS-03）の一覧入力。記録画面の一覧入力（REC-05）と同じ表で、その日の種目をカードで並べる。
 * 打ち終えたセットは次の行を足すときに保存し、残りは「完了」で保存して履歴に戻る。
 */
export function ListWorkoutEditor({ userId, workoutId, newWorkoutId, date, initialSets, exercises, bodyweightLogs, onCreateExercise, onSaved }: Props) {
  const navigate = useNavigate()
  const { show } = useToast()
  const [unit, setUnit] = useWeightUnit(userId)
  const [savedId, setSavedId] = useState<string | null>(workoutId)
  const [sets, setSets] = useState<WorkoutSet[]>(initialSets)
  // 種目の並び（その日に初めて記録した順）と、種目ごとの行
  const [order, setOrder] = useState<string[]>(() => [...new Set(initialSets.map((s) => s.exercise_id))])
  const [rows, setRows] = useState<Record<string, ListRow[]>>(() => Object.fromEntries(
    [...new Set(initialSets.map((s) => s.exercise_id))].map((id) => [id, rowsFromSets(initialSets.map(toLogged), id, unit).rows]),
  ))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(!workoutId)
  const [managingGroup, setManagingGroup] = useState<MuscleGroup | null>(null)

  const names = Object.fromEntries(exercises.map((e) => [e.id, exerciseLabel(e)]))
  const isBodyweight = (id: string) => exercises.some((e) => e.id === id && e.is_bodyweight)
  const bodyweight = bodyweightOn(bodyweightLogs, date)
  // 自重種目は、その日の体重分までアシスト（マイナス）を入力できる
  const minWeightFor = (id: string) => (isBodyweight(id) && bodyweight !== null ? -bodyweight : 0)
  const planFor = (id: string) => planListSave(rows[id] ?? [], sets.filter((s) => s.exercise_id === id).map(toLogged), id, minWeightFor(id), unit)
  const dirty = order.some((id) => {
    const plan = planFor(id)
    return plan.upserts.length > 0 || plan.deletes.length > 0 || plan.incomplete.length > 0 || plan.invalid !== null
  })

  // 保存していない行があるまま再読み込みしようとしたら止める
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || busy) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])

  /** この日の記録のIDを返す。まだ無ければ、その日の記録に足すか新しく作る（1日の記録は1件） */
  async function ensureWorkout(): Promise<string> {
    if (savedId) return savedId
    // 同じ日の記録がほかの画面で作られていたら、その記録に足す（そのセットは行に無いので、消さないよう読み込まない）
    const id = await findWorkoutOnDate(userId, date) ?? newWorkoutId
    if (id === newWorkoutId) await createDatedWorkout(userId, id, date)
    setSavedId(id)
    return id
  }

  /**
   * 種目の行を保存する。範囲外の値（と、allowIncomplete でなければ片方だけの行）があれば保存せず false。
   * 通信に失敗したときも false を返し、行はそのまま残す。
   */
  async function saveExercise(id: string, allowIncomplete: boolean): Promise<boolean> {
    const plan = planFor(id)
    const blockIncomplete = !allowIncomplete && plan.incomplete.length > 0
    const rowErrors: Record<string, string> = blockIncomplete ? Object.fromEntries(plan.incomplete.map((rowId) => [rowId, '重量と回数の両方を入れてください'])) : {}
    if (plan.invalid) rowErrors[plan.invalid.id] = plan.invalid.message
    const ids = new Set((rows[id] ?? []).map((r) => r.id))
    setErrors((old) => ({ ...Object.fromEntries(Object.entries(old).filter(([rowId]) => !ids.has(rowId))), ...rowErrors }))
    if (plan.invalid || blockIncomplete) {
      show(plan.invalid?.message ?? '重量と回数の両方を入れてください')
      return false
    }
    if (!plan.upserts.length && !plan.deletes.length) return true
    try {
      if (savedId) for (const setId of plan.deletes) await removeWorkoutSet(savedId, setId)
      let wid = savedId
      if (plan.upserts.length) {
        wid = await ensureWorkout()
        for (const set of plan.upserts) await saveEditableSet(wid, { ...set, note: set.note ?? null }, minWeightFor(id))
      }
      const now = new Date().toISOString()
      setSets((old) => [
        ...old.filter((s) => s.exercise_id !== id),
        ...plan.sets.map((s) => ({ ...s, note: s.note ?? null, workout_id: wid!, created_at: old.find((o) => o.id === s.id)?.created_at ?? now })),
      ])
      if (wid) onSaved(wid)
      return true
    } catch (e) {
      show(`保存できませんでした。もう一度お試しください（${toMessage(e)}）`)
      return false
    }
  }

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (busy) return undefined
    setBusy(true)
    try { return await task() }
    finally { setBusy(false) }
  }

  /** 次のセットの行を足す。打ち終えたセットはこの時点で保存する */
  function addRow(id: string) {
    void run(async () => {
      // 範囲外の値があれば、行を足す前に直してもらう（エラーは saveExercise が出す）
      const invalid = planFor(id).invalid !== null
      await saveExercise(id, true)
      // 通信できずに保存できなかったときも行は足し、左上の「‹」でまとめて保存し直す
      if (!invalid) setRows((old) => ({ ...old, [id]: [...(old[id] ?? []), newRow()] }))
    })
  }

  function updateRows(id: string, next: ListRow[]) {
    setRows((old) => ({ ...old, [id]: next }))
    // 直した行のエラーは消す
    setErrors((old) => Object.fromEntries(Object.entries(old).filter(([rowId]) => !next.some((r) => r.id === rowId && !(rows[id] ?? []).includes(r)))))
  }

  function choose(exercise: Exercise) {
    setPicking(false)
    setManagingGroup(null)
    if (order.includes(exercise.id)) return
    setOrder((old) => [...old, exercise.id])
    setRows((old) => ({ ...old, [exercise.id]: withDefaultRows() }))
  }

  function changeUnit(next: WeightUnit) {
    if (next === unit) return
    setRows((old) => Object.fromEntries(Object.entries(old).map(([id, list]) => [id, list.map((r) => ({ ...r, weight: convertWeightText(r.weight, unit, next) }))])))
    setUnit(next)
  }

  /** すべての種目を保存して履歴に戻る。片方だけの行は保存されないので確かめる */
  function finish() {
    void run(async () => {
      const incomplete = order.reduce((n, id) => n + (rows[id] ?? []).filter(isIncompleteRow).length, 0)
      if (incomplete > 0 && !window.confirm(`重量か回数が入っていないセットが${incomplete}件あります。保存せずに履歴に戻りますか？`)) return
      for (const id of order) if (!(await saveExercise(id, true))) return
      // 行をすべて消したら、空になった記録も消す（履歴に「0セット」の日を残さない）
      const left = order.reduce((n, id) => n + planFor(id).sets.length, 0)
      if (savedId && left === 0 && await deleteWorkoutIfEmpty(savedId).catch(() => false)) show('記録を削除しました')
      navigate('/history?date=' + date)
    })
  }

  function removeAll() {
    if (!savedId || !window.confirm('この日のトレーニング記録を削除しますか？')) return
    void run(async () => {
      try {
        await removeWorkout(userId, savedId)
        onSaved(savedId)
        navigate('/history?date=' + date)
      } catch (e) { show(toMessage(e)) }
    })
  }

  const [year, month, day] = date.split('-').map(Number)

  if (picking) {
    return <div className="min-h-full pb-24">
      <header className="flex items-center gap-2 px-4 py-1">
        <button type="button" aria-label="戻る" onClick={() => { if (managingGroup) setManagingGroup(null); else if (order.length) setPicking(false); else navigate('/history?date=' + date) }}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-fg active:opacity-60">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <h1 className="shrink-0 text-lg font-semibold">種目を選択</h1>
        {!managingGroup && <p className="ml-auto min-w-0 text-right text-[10px] leading-tight text-muted">
          <span className="block">← スワイプで非表示</span>
          <span className="block">⠿ 長押しで並び替え</span>
        </p>}
      </header>
      {managingGroup
        ? <ExercisePicker key={managingGroup} exercises={exercises} userId={userId} initialGroup={managingGroup} initialManaging
          onSelect={choose} onCreate={async (name, group) => choose(await onCreateExercise(name, group))} />
        : <GroupedExercisePicker exercises={exercises} userId={userId} onSelect={choose} onManage={setManagingGroup} />}
    </div>
  }

  return <div className="min-h-full pb-28">
    {/* 記録画面の一覧入力と同じく、左上の「‹」で保存して戻り、日付を中央に置く */}
    <header className="sticky top-0 z-20 grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center bg-bg px-4 py-1">
      <button type="button" data-button-key="finish-history-edit" aria-label="保存して履歴に戻る" disabled={busy} onClick={finish}
        className="-ml-2 flex h-11 w-11 items-center justify-center text-fg active:opacity-60 disabled:opacity-40">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
      </button>
      <h1 className="text-center text-lg font-semibold tabular-nums">{busy ? '保存中…' : `${year}年${month}月${day}日`}</h1>
      <div role="radiogroup" aria-label="重さの単位" className="flex justify-self-end rounded-md bg-accent/20 p-0.5 text-xs">
        {(['kg', 'lbs'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={unit === value}
          disabled={busy} onClick={() => changeUnit(value)}
          className={`min-h-7 rounded px-1.5 font-semibold ${unit === value ? 'bg-accent text-white' : 'text-accent'}`}>{value}</button>)}
      </div>
    </header>
    <section aria-label="この日の記録" className="space-y-4 px-4 pt-2">
      {order.map((id) => {
        const name = names[id] ?? '種目'
        return <article key={id} className="overflow-hidden rounded-xl bg-surface">
          <h2 className="bg-accent px-4 py-1 text-base font-semibold text-white">{name}</h2>
          <ListSetTable exerciseName={name} rows={rows[id] ?? []} onChange={(next) => updateRows(id, next)} errors={errors}
            previousFirst={null} unit={unit} bodyweight={isBodyweight(id) ? { value: bodyweight } : null} disabled={busy} />
          <div className="flex justify-center border-t border-border">
            <button type="button" aria-label={`${name}にセットを追加`} disabled={busy} onClick={() => addRow(id)}
              className="flex h-11 w-14 items-center justify-center rounded-full text-muted active:bg-border disabled:opacity-40">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-border text-base leading-none text-fg">＋</span>
            </button>
          </div>
        </article>
      })}
      {order.length > 0 && <p className="text-center text-xs text-muted">セットは左にスワイプで削除。左上の「‹」で保存します</p>}
    </section>
    {savedId && <button type="button" disabled={busy} className="mx-4 mt-6 min-h-14 w-[calc(100%-2rem)] text-sm text-accent" onClick={removeAll}>この記録を削除</button>}
    <AddFab label="種目を追加" disabled={busy} onClick={() => setPicking(true)} aboveNavigation />
  </div>
}
