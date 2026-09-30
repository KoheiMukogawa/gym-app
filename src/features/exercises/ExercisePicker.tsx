import { useEffect, useRef, useState } from 'react'
import { normalizeExerciseName } from '../../lib/calc'
import { InputError, toMessage } from '../../lib/errors'
import { MUSCLE_GROUP_LABELS, type Exercise, type MuscleGroup } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { SortableList } from '../../components/SortableList'
import { armLabel, exerciseLabel, isBasicExercise, PICKER_GROUPS, sortExercises } from './catalog'
import { fetchExerciseOrder, saveExerciseOrder } from '../routines/queries'

type Props = {
  exercises: Exercise[]
  recentIds?: string[] // Old callers may provide this; it is no longer displayed.
  userId?: string | null
  onSelect: (exercise: Exercise) => void
  onCreate: (name: string, group: MuscleGroup) => Promise<void>
  createLabel?: string
}
const GROUPS = PICKER_GROUPS

export function ExercisePicker({ exercises, userId, onSelect, onCreate, createLabel = '追加して記録' }: Props) {
  const [group, setGroup] = useState<MuscleGroup>('chest')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [orderLoading, setOrderLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const orderLock = useRef(false)
  useEffect(() => {
    let active = true
    setOrderLoading(true)
    if (!userId) { setOrderLoading(false); return }
    fetchExerciseOrder(userId).then((ids) => { if (active) { setOrder(ids); setOrderError(null) } })
      .catch((e) => { if (active) setOrderError(toMessage(e)) })
      .finally(() => { if (active) setOrderLoading(false) })
    return () => { active = false }
  }, [userId, attempt])
  const visible = sortExercises(exercises.filter((e) => e.muscle_group === group &&
    (isBasicExercise(e) || (!e.is_preset && !!userId && e.created_by === userId))), order)

  async function create() {
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const existing = exercises.find((e) => e.name_normalized === normalizeExerciseName(name) &&
        (isBasicExercise(e) || e.created_by === userId))
      if (existing) {
        if (existing.muscle_group !== group) throw new InputError('同じ名前の種目が' + MUSCLE_GROUP_LABELS[existing.muscle_group] + 'にあります。別の名前を入力してください。')
        onSelect(existing)
      } else {
        await onCreate(name.trim(), group)
      }
      setCreating(false)
      setName('')
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function saveOrder(next: string[]) {
    if (!userId || orderLock.current) return
    orderLock.current = true
    setSaving(true); setOrderError(null); setOrder(next); setPendingOrder(next)
    try { await saveExerciseOrder(userId, next); setPendingOrder(null) }
    catch (e) { setOrderError(toMessage(e)) }
    finally { orderLock.current = false; setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <section>
        <h2 className="mb-3 text-xs tracking-wide text-muted">部位から選ぶ</h2>
        <div className="grid grid-cols-3 gap-2">
          {GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} disabled={saving}
              onClick={() => { setGroup(g); setError(null) }}
              className={'min-h-14 rounded-xl border text-sm font-semibold ' + (group === g ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-muted')}>
              {MUSCLE_GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </section>
      {creating ? (
        <form className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
          onSubmit={(e) => { e.preventDefault(); void create() }}>
          <h2 className="font-semibold">{MUSCLE_GROUP_LABELS[group]}の種目を追加</h2>
          <label className="flex flex-col gap-2 text-sm text-muted">種目名
            <input autoFocus required maxLength={80} value={name} disabled={saving}
              onChange={(e) => setName(e.target.value)} placeholder="例：インクラインダンベルプレス"
              className="min-h-14 rounded-xl border border-border bg-bg px-3 text-fg" />
          </label>
          {error && <p role="alert" className="text-sm text-accent">{error}</p>}
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? '追加中…' : createLabel}</Button>
          <Button variant="ghost" disabled={saving} onClick={() => { setCreating(false); setError(null) }}>キャンセル</Button>
        </form>
      ) : (
        <section aria-label={MUSCLE_GROUP_LABELS[group] + 'の種目'}>
          <div className="flex min-h-14 items-center justify-between text-sm">
            <span className="text-muted">{MUSCLE_GROUP_LABELS[group]}の種目</span>
            <span className="text-xs text-muted">⠿ 長押しで並び替え</span>
          </div>
          {orderError && <div className="mb-3 text-sm"><p role="alert">並び順を読み込み・保存できませんでした。</p><button disabled={saving} className="min-h-14 text-accent" onClick={() => { if (pendingOrder) void saveOrder(pendingOrder); else setAttempt((n) => n + 1) }}>再試行</button></div>}
          <SortableList items={visible.map((e) => ({ id: e.id, label: exerciseLabel(e) }))}
            disabled={!userId || saving || orderLoading || !!orderError}
            onReorder={(ids) => void saveOrder([...ids, ...order.filter((id) => !ids.includes(id))])}
            className="overflow-hidden rounded-2xl border border-border bg-surface"
            renderItem={(item, handle) => {
              const e = visible.find((exercise) => exercise.id === item.id)!
              return <div className="flex items-center border-b border-border">
                <button type="button" onClick={() => onSelect(e)}
                  className="flex min-h-16 min-w-0 flex-1 items-center px-4 py-3 text-left active:bg-border">
                  <span>{exerciseLabel(e)}{armLabel(e) && <span className="mt-1 block text-xs text-accent">{armLabel(e)}</span>}
                    {!e.is_preset && <span className="mt-1 block text-xs text-muted">自分の種目</span>}</span>
                </button>{handle}
              </div>
            }} />
          {visible.length === 0 && <p className="p-4 text-sm text-muted">この部位の種目を追加しましょう</p>}
          {saving && <p role="status" className="mt-2 text-xs text-muted">保存中…</p>}
          <button type="button" disabled={saving} onClick={() => setCreating(true)} className="mt-2 min-h-14 w-full text-sm text-muted">
            ＋ {MUSCLE_GROUP_LABELS[group]}の種目を追加
          </button>
        </section>
      )}
    </div>
  )
}
