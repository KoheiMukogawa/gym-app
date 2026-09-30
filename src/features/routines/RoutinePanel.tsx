import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { toMessage } from '../../lib/errors'
import type { Exercise, MuscleGroup } from '../../lib/types'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { exerciseLabel } from '../exercises/catalog'
import { createExercise } from '../exercises/queries'
import { deleteRoutine, fetchRoutines, moveItem, saveRoutine, type Routine } from './queries'

type Props = {
  userId: string
  exercises: Exercise[]
  onExerciseCreated: (exercise: Exercise) => void
  onStart: (routine: Routine) => void
  onEditingChange?: (editing: boolean) => void
}
export function RoutinePanel({ userId, exercises, onExerciseCreated, onStart, onEditingChange }: Props) {
  const [items, setItems] = useState<Routine[]>([])
  const [editing, setEditing] = useState<Routine | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => { onEditingChange?.(editing !== null) }, [editing, onEditingChange])
  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try { setItems(await fetchRoutines(userId)) }
    catch (e) { setLoadError(toMessage(e)) }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { void load() }, [load])
  const nameFor = (id: string) => {
    const exercise = exercises.find((e) => e.id === id)
    return exercise ? exerciseLabel(exercise) : '見つからない種目'
  }
  function select(exercise: Exercise) {
    setEditing((old) => old && !old.exercise_ids.includes(exercise.id)
      ? { ...old, exercise_ids: [...old.exercise_ids, exercise.id] } : old)
    setChoosing(false)
  }
  async function create(name: string, muscle_group: MuscleGroup) {
    const exercise = await createExercise({ name, muscle_group, userId })
    onExerciseCreated(exercise)
    select(exercise)
  }
  if (editing) return (
    <section className="mb-6 space-y-3 border-y border-border py-4" aria-label="ルーティン編集">
      <div className="px-4">
        <h2 className="mb-3 text-lg font-semibold">ルーティンを作る・編集</h2>
        <label className="flex flex-col gap-2 text-sm text-muted">ルーティン名
          <input value={editing.name} maxLength={40} disabled={busy} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="例：胸の日" className="min-h-14 rounded-xl border border-border bg-surface px-3 text-fg" />
        </label>
        <ol className="mt-3 space-y-2">
          {editing.exercise_ids.map((id, index) => (
            <li key={id} className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-1 text-sm">{index + 1}. {nameFor(id)}</div>
              <div className="flex justify-end">
                <button className="min-h-14 min-w-14 disabled:opacity-25" aria-label={nameFor(id) + 'を上へ'} disabled={busy || index === 0}
                  onClick={() => setEditing({ ...editing, exercise_ids: moveItem(editing.exercise_ids, index, -1) })}>↑</button>
                <button className="min-h-14 min-w-14 disabled:opacity-25" aria-label={nameFor(id) + 'を下へ'} disabled={busy || index === editing.exercise_ids.length - 1}
                  onClick={() => setEditing({ ...editing, exercise_ids: moveItem(editing.exercise_ids, index, 1) })}>↓</button>
                <button className="min-h-14 min-w-14 text-sm text-muted" aria-label={nameFor(id) + 'をルーティンから外す'} disabled={busy}
                  onClick={() => setEditing({ ...editing, exercise_ids: editing.exercise_ids.filter((value) => value !== id) })}>外す</button>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {choosing ? <><ExercisePicker userId={userId} exercises={exercises} onSelect={select} onCreate={create} createLabel="追加して選択" />
        <button className="min-h-14 w-full text-sm text-muted" onClick={() => setChoosing(false)}>種目の追加をやめる</button></>
        : <div className="px-4"><Button variant="ghost" disabled={busy || editing.exercise_ids.length >= 30} onClick={() => setChoosing(true)}>＋ ルーティンに種目を追加</Button></div>}
      <div className="space-y-3 px-4">
        {error && <p role="alert" className="text-sm text-accent">{error}</p>}
        <Button disabled={busy || choosing || !editing.name.trim() || editing.exercise_ids.length === 0 ||
          editing.exercise_ids.some((id) => !exercises.some((e) => e.id === id))}
          onClick={async () => {
            setBusy(true); setError(null)
            try {
              const saved = await saveRoutine(editing)
              setItems((old) => old.some((r) => r.id === saved.id) ? old.map((r) => r.id === saved.id ? saved : r) : [...old, saved])
              setEditing(null)
            } catch (e) { setError(toMessage(e)) }
            finally { setBusy(false) }
          }}>{busy ? '保存中…' : 'ルーティンを保存'}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setEditing(null); setChoosing(false); setError(null) }}>キャンセル</Button>
        {items.some((r) => r.id === editing.id) && <button className="min-h-14 w-full text-sm text-accent" disabled={busy}
          onClick={async () => {
            if (!window.confirm('このルーティンを削除しますか？トレーニングの記録は残ります。')) return
            setBusy(true); setError(null)
            try { await deleteRoutine(userId, editing.id); setItems((old) => old.filter((r) => r.id !== editing.id)); setEditing(null) }
            catch (e) { setError(toMessage(e)) }
            finally { setBusy(false) }
          }}>ルーティンを削除</button>}
      </div>
    </section>
  )
  return (
    <section className="mb-6 space-y-2 px-4" aria-label="ルーティン">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">マイルーティン</h2>
        <button className="min-h-14 px-2 text-sm text-accent" disabled={loading || !!loadError} onClick={() => {
          setError(null); setEditing({ id: crypto.randomUUID(), user_id: userId, name: '', exercise_ids: [] })
        }}>＋ 作る</button>
      </div>
      {loading && <p className="text-xs text-muted">読み込み中…</p>}
      {loadError && <div><p role="alert" className="text-sm text-accent">ルーティンを読み込めませんでした。</p><button className="min-h-14 text-sm text-accent" onClick={() => void load()}>ルーティンを再試行</button></div>}
      {!loading && !loadError && items.length === 0 && <p className="text-sm text-muted">いつもの種目と順番を保存して、すぐにスタート。</p>}
      {items.map((routine) => {
        const missing = routine.exercise_ids.some((id) => !exercises.some((e) => e.id === id))
        return <div key={routine.id} className="flex items-center rounded-xl border border-border bg-surface">
          <button className="min-h-16 min-w-0 flex-1 px-4 py-3 text-left disabled:opacity-40" disabled={missing}
            aria-label={routine.name + 'を開始'} onClick={() => onStart(routine)}>
            <span className="block font-semibold">{routine.name}</span>
            <span className="mt-1 block truncate text-xs text-muted">{missing ? '種目を確認してください' : routine.exercise_ids.map(nameFor).join(' → ')}</span>
          </button>
          <button className="min-h-14 min-w-14 text-sm text-muted" aria-label={routine.name + 'を編集'}
            onClick={() => { setEditing({ ...routine, exercise_ids: [...routine.exercise_ids] }); setError(null) }}>編集</button>
        </div>
      })}
    </section>
  )
}
