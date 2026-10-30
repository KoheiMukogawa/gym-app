import { useEffect, useState } from 'react'
import { MUSCLE_GROUP_LABELS, type Exercise, type MuscleGroup } from '../../lib/types'
import { toMessage } from '../../lib/errors'
import { armLabel, exerciseLabel, isBasicExercise, PICKER_GROUPS, sortExercises } from '../exercises/catalog'
import { fetchExerciseOrder, fetchExerciseVisibility, type ExerciseVisibility } from '../routines/queries'

/**
 * 一覧入力の種目を選択（REC-04）。部位ごとのカードに、表示する設定の種目をすべて並べる（どれを出すかは「種目を追加」で本人が選ぶ）。
 * 並び順・表示する種目は ExercisePicker と同じ設定を使う。
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
  useEffect(() => {
    if (!userId) return
    let active = true
    setError(null)
    Promise.all([fetchExerciseOrder(userId), fetchExerciseVisibility(userId)])
      .then(([ids, value]) => { if (active) { setOrder(ids); setVisibility(value) } })
      .catch((e) => { if (active) setError(toMessage(e)) })
    return () => { active = false }
  }, [userId, attempt])

  if (error) return <div className="px-4 text-sm"><p role="alert" className="text-accent">種目を読み込めませんでした。{error}</p>
    <button type="button" className="min-h-14 text-accent" onClick={() => setAttempt((n) => n + 1)}>再試行</button></div>
  if (userId && !visibility) return <p role="status" className="px-4 text-sm text-muted">種目を読み込み中…</p>

  const visible = (e: Exercise) => (e.is_preset || (!!userId && e.created_by === userId)) &&
    !visibility?.hiddenIds.includes(e.id) && (isBasicExercise(e) || !e.is_preset || !!visibility?.addedIds.includes(e.id))
  const groups = PICKER_GROUPS.map((group) => {
    return { group, items: sortExercises(exercises.filter((e) => e.muscle_group === group && visible(e)), order) }
  })

  return <div className="space-y-4 px-4 pb-6">
    {groups.map(({ group, items }) => {
      const label = MUSCLE_GROUP_LABELS[group]
      return <section key={group} aria-label={`${label}の種目`} className="overflow-hidden rounded-xl bg-surface">
        <h2 className="bg-accent px-4 py-1.5 text-sm font-semibold text-white">{label}</h2>
        <ul className="divide-y divide-border">
          {items.map((e) => <li key={e.id}>
            <button type="button" onClick={() => onSelect(e)} className="flex min-h-11 w-full flex-col justify-center px-4 py-1.5 text-left active:bg-border">
              <span>{exerciseLabel(e)}</span>
              {armLabel(e) && <span className="text-xs text-accent">{armLabel(e)}</span>}
            </button>
          </li>)}
        </ul>
        <div className="flex items-center border-t border-border px-4 text-sm text-muted">
          <button type="button" onClick={() => onManage(group)} className="min-h-10">種目を追加</button>
        </div>
      </section>
    })}
  </div>
}
