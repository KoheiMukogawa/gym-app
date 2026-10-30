import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAddedLoad } from '../../lib/bodyweight'
import { localDate } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import { fetchPreviousWorkout, type PreviousWorkout } from './queries'
import { kgToUnitText, type WeightUnit } from './weightUnit'

export type PreviousState = { workout: PreviousWorkout | null; loading: boolean; error: string | null; retry: () => void }

/** この種目の前回の記録。表の1行目の「写す」ボタンも使うので、カードではなく記録画面が持つ。 */
export function usePreviousWorkout(userId: string | null, exerciseId: string | null): PreviousState {
  const [result, setResult] = useState<{ key: string; workout: PreviousWorkout | null; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${userId}:${exerciseId}:${attempt}`
  useEffect(() => {
    if (!userId || !exerciseId) return
    let active = true
    fetchPreviousWorkout(userId, exerciseId)
      .then((workout) => { if (active) setResult({ key, workout, error: null }) })
      .catch((e) => { if (active) setResult({ key, workout: null, error: toMessage(e) }) })
    return () => { active = false }
  }, [userId, exerciseId, key])
  // 種目を変えた直後は、前の種目の結果を出さない
  const current = result?.key === key ? result : null
  return { workout: current?.workout ?? null, loading: current === null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1) }
}

export function ListPreviousRecord({ exerciseId, previous, isBodyweight, unit, onCopy, disabled }: {
  exerciseId: string
  previous: PreviousState
  isBodyweight: boolean
  unit: WeightUnit
  onCopy: () => void
  disabled: boolean
}) {
  const { workout, loading, error, retry } = previous
  const load = (weight: number) => (isBodyweight ? formatAddedLoad(weight) : `${Number(kgToUnitText(weight, unit)).toFixed(1)} ${unit}`)
  const date = workout ? localDate(workout.performed_at).replaceAll('-', '/') : null
  return <section aria-label="前回の記録" className="rounded-t-xl bg-border/70 px-4 py-2">
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-semibold">前回の記録{date && <span className="ml-1 tabular-nums">: {date}</span>}</h2>
      <Link to={`/exercises/${exerciseId}`} state={{ from: '/log' }} className="flex min-h-10 items-center text-sm font-semibold text-sky-400">グラフ</Link>
    </div>
    {loading ? <p role="status" className="text-xs text-muted">読み込み中…</p>
      : error ? <p role="alert" className="text-xs text-accent">前回の記録を読み込めませんでした。<button type="button" className="min-h-11 underline" onClick={retry}>再試行</button></p>
      : !workout ? <p className="text-xs text-muted">この種目の前回の記録はありません</p>
      : <div className="flex items-center gap-3">
        <ol className="min-w-0 flex-1 space-y-0.5 text-sm text-muted tabular-nums">
          {workout.sets.map((set) => <li key={set.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
            <span>{set.set_index}</span>
            <span className="break-words">{load(set.weight_kg)} × {set.reps} 回{set.note && <span className="ml-2 text-xs">{set.note}</span>}</span>
          </li>)}
        </ol>
        <button type="button" data-button-key="copy-previous" aria-label="前回の記録を写す" disabled={disabled} onClick={onCopy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg active:bg-border disabled:opacity-40">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M8 3h6l4 4v10H8z" /><path d="M14 3v4h4" /><path d="M5 7v14h10" />
          </svg>
        </button>
      </div>}
  </section>
}
