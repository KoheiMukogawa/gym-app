import { Link } from 'react-router-dom'
import { formatAddedLoad } from '../../lib/bodyweight'
import type { FeedItem } from './queries'
import { WorkoutSetDetails } from './WorkoutSetDetails'

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** bodyweight はその日の体重。自重種目のボリュームを総重量（体重＋加重）で数えるのに使う。 */
export function WorkoutCard({ item, editable = false, bodyweight = null, detailed = false }: { item: FeedItem; editable?: boolean; bodyweight?: number | null; detailed?: boolean }) {
  // 最大重量は挙げられたセットだけで見る。0回（つぶれたセット）しかない種目はその重量を出す。
  const byExercise = new Map<string, { name: string; count: number; max: number; bodyweight: boolean; lifted: boolean }>()
  for (const s of item.sets) {
    const lifted = s.reps > 0
    const current = byExercise.get(s.exercise_id)
    if (!current) {
      byExercise.set(s.exercise_id, { name: s.exercise_name, count: 1, max: s.weight_kg, bodyweight: !!s.is_bodyweight, lifted })
      continue
    }
    current.count += 1
    if (lifted && !current.lifted) { current.max = s.weight_kg; current.lifted = true }
    else if (lifted === current.lifted) current.max = Math.max(current.max, s.weight_kg)
  }

  const volume = Math.round(item.sets.reduce((sum, s) => sum + (s.weight_kg + (s.is_bodyweight ? bodyweight ?? 0 : 0)) * s.reps, 0) * 10) / 10

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <span className="font-semibold">{editable ? formatDate(item.performed_at) : item.display_name}</span>
        {editable ? <Link to={`/history/${item.workout_id}`} className="flex min-h-14 items-center px-3 text-sm text-accent">編集</Link> : <span className="text-xs text-muted">{formatDate(item.performed_at)}</span>}
      </header>

      {detailed ? <WorkoutSetDetails item={item} bodyweight={bodyweight} /> : <ul className="flex flex-col">
        {[...byExercise.entries()].map(([id, e]) => (
          <li key={id} className="flex min-h-14 items-center justify-between text-sm">
            <Link
              to={`/exercises/${id}`}
              className="flex min-h-14 flex-1 items-center underline-offset-4 hover:underline"
            >
              {e.name}
            </Link>
            <span className="tabular-nums text-muted">
              {e.count}セット / 最大 {e.bodyweight ? formatAddedLoad(e.max) : `${e.max} kg`}
            </span>
          </li>
        ))}
      </ul>}

      <footer className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-xs text-muted">
        <span>{item.sets.length}セット</span>
        <span className="tabular-nums">{volume.toLocaleString('en-US')} kg</span>
      </footer>
    </article>
  )
}
