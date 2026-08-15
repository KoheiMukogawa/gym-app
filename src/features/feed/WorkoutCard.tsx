import { Link } from 'react-router-dom'
import { totalVolume } from '../../lib/calc'
import type { FeedItem } from './queries'

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function WorkoutCard({ item }: { item: FeedItem }) {
  const byExercise = new Map<string, { name: string; count: number; max: number }>()
  for (const s of item.sets) {
    const current = byExercise.get(s.exercise_id)
    if (current) {
      current.count += 1
      current.max = Math.max(current.max, s.weight_kg)
    } else {
      byExercise.set(s.exercise_id, { name: s.exercise_name, count: 1, max: s.weight_kg })
    }
  }

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <span className="font-semibold">{item.display_name}</span>
        <span className="text-xs text-muted">{formatDate(item.performed_at)}</span>
      </header>

      <ul className="flex flex-col gap-1">
        {[...byExercise.entries()].map(([id, e]) => (
          <li key={id} className="flex items-baseline justify-between text-sm">
            <Link to={`/exercises/${id}`} className="underline-offset-4 hover:underline">
              {e.name}
            </Link>
            <span className="tabular-nums text-muted">
              {e.count}セット / 最大 {e.max} kg
            </span>
          </li>
        ))}
      </ul>

      <footer className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-xs text-muted">
        <span>{item.sets.length}セット</span>
        <span className="tabular-nums">{totalVolume(item.sets).toLocaleString('en-US')} kg</span>
      </footer>
    </article>
  )
}
