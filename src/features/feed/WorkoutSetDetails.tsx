import { formatAddedLoad } from '../../lib/bodyweight'
import { estimateOneRepMax } from '../../lib/strength'
import type { FeedItem } from './queries'

const kg = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)

/** Shared by today's training and the selected day's history. */
export function WorkoutSetDetails({ item, bodyweight }: { item: FeedItem; bodyweight: number | null }) {
  const groups = new Map<string, { name: string; bodyweight: boolean; sets: FeedItem['sets'] }>()
  for (const set of item.sets) {
    const group = groups.get(set.exercise_id)
    if (group) group.sets.push(set)
    else groups.set(set.exercise_id, { name: set.exercise_name, bodyweight: !!set.is_bodyweight, sets: [set] })
  }
  return <div className="flex flex-col gap-2">
    {[...groups.entries()].map(([id, group]) => {
      const rms = group.sets.map(s => estimateOneRepMax(s.weight_kg + (group.bodyweight ? bodyweight ?? 0 : 0), s.reps)).filter((v): v is number => v !== null)
      return <section key={id} aria-label={group.name} className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 break-words font-semibold">{group.name}</h3>
          {rms.length > 0 && <span className="shrink-0 text-sm text-muted">RM <strong className="text-fg tabular-nums">{kg(Math.max(...rms))}</strong> kg</span>}
        </div>
        <ol className="space-y-0.5 text-sm tabular-nums">
          {group.sets.map((s, i) => <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-2">
            <span className="text-muted">{i + 1}</span>
            <span>{group.bodyweight ? formatAddedLoad(s.weight_kg) : `${s.weight_kg.toFixed(1)} kg`}</span>
            <span><span className="text-muted">×</span> {s.reps} <span className="text-xs text-muted">reps</span></span>
            {s.note && <span className="col-start-2 col-end-4 whitespace-pre-wrap break-words text-xs text-muted">{s.note}</span>}
          </li>)}
        </ol>
      </section>
    })}
  </div>
}
