import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { formatAddedLoad } from '../../lib/bodyweight'
import { localDate } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import { fetchPreviousWorkout, type PreviousWorkout } from './queries'

/** Mounted with an exercise/user key so old results and expansion never follow a new selection. */
export function PreviousWorkoutCard({ userId, exerciseId, isBodyweight }: {
  userId: string; exerciseId: string; isBodyweight: boolean
}) {
  const [workout, setWorkout] = useState<PreviousWorkout | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    fetchPreviousWorkout(userId, exerciseId)
      .then(value => { if (active) setWorkout(value) })
      .catch(reason => { if (active) setError(toMessage(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, exerciseId, attempt])

  if (loading) return <p role="status" className="text-xs text-muted">前回の記録を読み込み中…</p>
  if (error) return <section aria-label="前回の記録" className="rounded-xl border border-border px-3 py-2">
    <p role="alert" className="text-sm text-accent">前回の記録を読み込めませんでした。{error}</p>
    <Button variant="ghost" onClick={() => { setError(null); setLoading(true); setAttempt(value => value + 1) }}>再試行</Button>
  </section>
  if (!workout) return <p className="text-xs text-muted">この種目の前回の記録はありません</p>

  const last = workout.sets[workout.sets.length - 1]
  const date = localDate(workout.performed_at)
  const [year, month, day] = date.split('-').map(Number)
  const dateLabel = year === new Date().getFullYear() ? `${month}/${day}` : `${year}/${month}/${day}`
  const load = (weight: number) => isBodyweight ? formatAddedLoad(weight) : `${weight}kg`
  return <details className="group rounded-xl border border-border bg-surface/50" aria-label="前回の記録">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <span className="block text-xs text-muted">前回 <time dateTime={date}>{dateLabel}</time> · {workout.sets.length}セット</span>
        <span className="mt-1 block text-sm tabular-nums">{load(last.weight_kg)} × {last.reps}回 <span className="text-xs text-muted">最終セット</span></span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <ol className="mx-3 divide-y divide-border border-t border-border pb-1">
      {workout.sets.map(set => <li key={set.id} className="py-2 text-sm">
        <div className="flex flex-wrap justify-between gap-2 tabular-nums">
          <span className="text-xs text-muted">{set.set_index}set</span>
          <span>{load(set.weight_kg)} × {set.reps}回</span>
        </div>
        {set.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">{set.note}</p>}
      </li>)}
    </ol>
  </details>
}
