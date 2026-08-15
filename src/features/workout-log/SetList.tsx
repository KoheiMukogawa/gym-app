import type { LoggedSet } from './logReducer'

type Props = {
  sets: LoggedSet[]
  exerciseNames: Record<string, string>
  onUndo: () => void
}

export function SetList({ sets, exerciseNames, onUndo }: Props) {
  if (sets.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {[...sets].reverse().map((s, i) => (
          <li
            key={`${s.exercise_id}-${s.set_index}-${i}`}
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
          >
            <div>
              <div className="text-sm">{exerciseNames[s.exercise_id] ?? '種目'}</div>
              <div className="text-xs text-muted">{s.set_index}セット目</div>
            </div>
            <div className="tabular-nums">
              <span className="text-xl font-bold">{s.weight_kg}</span>
              <span className="text-xs text-muted"> kg × </span>
              <span className="text-xl font-bold">{s.reps}</span>
              <span className="text-xs text-muted"> 回</span>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onUndo}
        className="mt-3 min-h-14 w-full text-sm text-muted"
      >
        直前のセットを取り消す
      </button>
    </div>
  )
}
