import { useEffect, useRef, useState } from 'react'
import { SortableList } from '../../components/SortableList'
import { ExerciseSwipeRow } from '../exercises/ExerciseSwipeRow'
import { MUSCLE_GROUP_LABELS, type Exercise, type MuscleGroup } from '../../lib/types'
import { toMessage } from '../../lib/errors'
import { armLabel, exerciseLabel, isBasicExercise, PICKER_GROUPS, sortExercises } from '../exercises/catalog'
import { fetchExerciseOrder, fetchExerciseVisibility, saveExerciseOrder, saveExerciseVisibility, type ExerciseVisibility } from '../routines/queries'

/**
 * 一覧入力の種目を選択（REC-04）。部位ごとのカードに、表示する設定の種目をすべて並べる（どれを出すかは「種目を追加」で本人が選ぶ）。
 * 並び順・表示する種目は ExercisePicker（REC-01）と同じ設定を使い、同じく長押しで並び替え、左スワイプで非表示にできる。
 */
export function GroupedExercisePicker({ exercises, userId, onSelect, onManage }: {
  exercises: Exercise[]
  userId: string | null
  onSelect: (exercise: Exercise) => void
  /** 種目の追加・表示の管理（今までの種目選択の画面）を開く */
  onManage: (group: MuscleGroup) => void
}) {
  const [order, setOrder] = useState<string[]>([])
  const [visibility, setVisibility] = useState<ExerciseVisibility | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const orderLock = useRef(false)
  useEffect(() => {
    if (!userId) return
    let active = true
    setError(null)
    Promise.all([fetchExerciseOrder(userId), fetchExerciseVisibility(userId)])
      .then(([ids, value]) => { if (active) { setOrder(ids); setVisibility(value) } })
      .catch((e) => { if (active) setError(toMessage(e)) })
    return () => { active = false }
  }, [userId, attempt])

  // 並び順は全部位で1つのリスト。並べ替えた部位の種目を先頭にし、ほかの種目の順はそのまま残す（REC-01と同じ）
  async function saveOrder(next: string[]) {
    if (!userId || orderLock.current) return
    orderLock.current = true
    const previous = order
    setSaving(true); setSaveError(null); setOrder(next)
    try { await saveExerciseOrder(userId, next) }
    catch (e) { setOrder(previous); setSaveError(`並び順を保存できませんでした。${toMessage(e)}`) }
    finally { orderLock.current = false; setSaving(false) }
  }

  async function hide(exercise: Exercise) {
    if (!userId || !visibility || saving) return
    const next: ExerciseVisibility = {
      addedIds: visibility.addedIds.filter((id) => id !== exercise.id),
      hiddenIds: [...visibility.hiddenIds, exercise.id],
    }
    setSaving(true); setSaveError(null)
    try { await saveExerciseVisibility(userId, next); setVisibility(next) }
    catch (e) { setSaveError(`非表示にできませんでした。${toMessage(e)}`) }
    finally { setSaving(false) }
  }

  if (error) return <div className="px-4 text-sm"><p role="alert" className="text-accent">種目を読み込めませんでした。{error}</p>
    <button type="button" className="min-h-14 text-accent" onClick={() => setAttempt((n) => n + 1)}>再試行</button></div>
  if (userId && !visibility) return <p role="status" className="px-4 text-sm text-muted">種目を読み込み中…</p>

  const visible = (e: Exercise) => (e.is_preset || (!!userId && e.created_by === userId)) &&
    !visibility?.hiddenIds.includes(e.id) && (isBasicExercise(e) || !e.is_preset || !!visibility?.addedIds.includes(e.id))
  const groups = PICKER_GROUPS.map((group) => {
    return { group, items: sortExercises(exercises.filter((e) => e.muscle_group === group && visible(e)), order) }
  })

  return <div className="space-y-4 px-4 pb-6">
    {saveError && <p role="alert" className="text-sm text-accent">{saveError}</p>}
    {groups.map(({ group, items }) => {
      const label = MUSCLE_GROUP_LABELS[group]
      return <section key={group} aria-label={`${label}の種目`} className="overflow-hidden rounded-xl bg-surface">
        <h2 className="bg-accent px-4 py-1.5 text-sm font-semibold text-white">{label}</h2>
        <SortableList items={items.map((e) => ({ id: e.id, label: exerciseLabel(e) }))}
          disabled={!userId || saving}
          onReorder={(ids) => void saveOrder([...ids, ...order.filter((id) => !ids.includes(id))])}
          className="divide-y divide-border" compact
          renderItem={(item, handle) => {
            const e = items.find((exercise) => exercise.id === item.id)!
            return <ExerciseSwipeRow label={exerciseLabel(e)} disabled={saving} onHide={() => hide(e)}>
              <button type="button" onClick={() => onSelect(e)} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-4 py-1.5 text-left active:bg-border">
                <span>{exerciseLabel(e)}</span>
                {armLabel(e) && <span className="text-xs text-accent">{armLabel(e)}</span>}
              </button>
              <span data-swipe-ignore>{handle}</span>
            </ExerciseSwipeRow>
          }} />
        <div className="flex items-center border-t border-border px-4 text-sm text-muted">
          <button type="button" onClick={() => onManage(group)} className="min-h-10">種目を追加</button>
        </div>
      </section>
    })}
  </div>
}
