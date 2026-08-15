import type { LoggedSet } from './logReducer'
import type { SetStatus } from './persistence'

type Props = {
  sets: LoggedSet[]
  exerciseNames: Record<string, string>
  status: Record<string, SetStatus>
  onUndo: () => void
  onRetry: (setId: string) => void
  undoing: boolean
}

export function SetList({ sets, exerciseNames, status, onUndo, onRetry, undoing }: Props) {
  if (sets.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {[...sets].reverse().map((s) => {
          // 保存直後にステータスが付く前の一瞬など、状態が未知のセットは
          // 保存済みとして扱う（実際には complete-set と同時に必ず pending が付く）。
          const st = status[s.id] ?? 'saved'
          return (
            <li
              key={s.id}
              className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 ${
                st === 'pending' ? 'opacity-50' : ''
              }`}
            >
              <div>
                <div className="text-sm">{exerciseNames[s.exercise_id] ?? '種目'}</div>
                <div className="text-xs text-muted">{s.set_index}セット目</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="tabular-nums text-right">
                  <span className="text-xl font-bold">{s.weight_kg}</span>
                  <span className="text-xs text-muted"> kg × </span>
                  <span className="text-xl font-bold">{s.reps}</span>
                  <span className="text-xs text-muted"> 回</span>
                </div>
                {st === 'failed' && (
                  <button
                    type="button"
                    onClick={() => onRetry(s.id)}
                    className="min-h-10 shrink-0 rounded-lg border border-accent px-3 text-xs font-semibold text-accent"
                  >
                    未保存・再試行
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={onUndo}
        disabled={undoing}
        className="mt-3 min-h-14 w-full text-sm text-muted disabled:opacity-40"
      >
        {undoing ? '取り消し中…' : '直前のセットを取り消す'}
      </button>
    </div>
  )
}
