import { SwipeRow } from '../../components/SwipeRow'
import type { LoggedSet } from './logReducer'
import type { SetStatus } from './persistence'
import { formatAddedLoad, totalLoad } from '../../lib/bodyweight'
import { setRm } from './setRm'
import { SetMemoEditor } from './SetMemoEditor'

type Props = {
  sets: LoggedSet[]
  activeExerciseId?: string | null
  exerciseNames: Record<string, string>
  status: Record<string, SetStatus>
  onDelete: (id: string) => Promise<void> | void
  onRetry: (id: string) => void
  onEditNote?: (id: string) => void
  editingId?: string | null
  onSaveNote?: (id: string, note: string) => Promise<void>
  onCloseNote?: () => void
  deletingId: string | null
  bodyweightIds?: string[]
  /** Today's bodyweight, so bodyweight sets can show their estimated 1RM. */
  bodyweight?: number | null
}

export function SetList({ sets, activeExerciseId, exerciseNames, status, onDelete, onRetry, onEditNote, editingId, onSaveNote, onCloseNote, deletingId, bodyweightIds = [], bodyweight = null }: Props) {
  if (!sets.length && !activeExerciseId) return <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
  const ids = activeExerciseId
    ? [...new Set([activeExerciseId, ...sets.slice().reverse().map((s) => s.exercise_id)])]
    : [...new Set(sets.map((s) => s.exercise_id))]

  return <div className="space-y-4">
    {ids.map((id) => <section key={id} className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{exerciseNames[id] ?? '種目'}</h2>
        {id === activeExerciseId && <span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">記録中</span>}
      </div>
      {id === activeExerciseId && !sets.some((s) => s.exercise_id === id) && <p className="py-3 text-sm text-muted">最初のセットを記録しましょう</p>}
      <ul className="divide-y divide-border">
        {sets.filter((s) => s.exercise_id === id).sort((a, b) => a.set_index - b.set_index).map((s, i) => {
          const load = bodyweightIds.includes(id) ? formatAddedLoad(s.weight_kg) : `${s.weight_kg}kg`
          const st = status[s.id] ?? 'saved'
          const setLoad = bodyweightIds.includes(id) ? totalLoad(s.weight_kg, bodyweight) : s.weight_kg
          const e1rm = setRm(setLoad, s.reps)
          return <SwipeRow key={s.id} label={`${exerciseNames[id] ?? '種目'} ${i + 1}set ${load} × ${s.reps}回を削除`}
            disabled={deletingId !== null || !!editingId} deleting={deletingId === s.id} onDelete={() => onDelete(s.id)}
            className={st === 'pending' ? 'opacity-50' : ''}>
            {/* Keep the memo beside its set, while preserving the surrounding list. */}
            <button type="button" disabled={!onEditNote || st === 'pending' || !!editingId} aria-expanded={editingId === s.id}
              aria-controls={editingId === s.id ? `set-memo-${s.id}` : undefined}
              aria-label={`${exerciseNames[id] ?? '種目'} ${i + 1}set ${load} × ${s.reps}回のメモ${s.note ? `: ${s.note}` : 'を追加'}`}
              onClick={() => onEditNote?.(s.id)}
              className="grid min-h-14 min-w-0 w-full grid-cols-[2rem_minmax(0,1fr)_5rem] items-center gap-x-2 text-left disabled:cursor-default">
              <span className="text-sm text-muted">{i + 1}set</span>
              <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,0.65fr)] items-baseline gap-x-1 text-lg font-semibold tabular-nums">
                <span className="text-right break-words">{bodyweightIds.includes(id) ? formatAddedLoad(s.weight_kg) : <>{s.weight_kg}<span className="text-xs font-normal text-muted"> kg</span></>}</span>
                <span className="text-xs font-normal text-muted">×</span>
                <span>{s.reps}<span className="text-xs font-normal text-muted"> 回</span></span>
              </span>
              <span className="text-right text-xs text-muted tabular-nums">
                <span className="block">推定1RM {e1rm?.value ?? '—'}</span>
                {e1rm?.reference && <span className="block text-[10px]">参考値</span>}
                {e1rm === null && <span className="block text-[10px]">{s.reps > 30 ? '30回までが対象' : s.reps < 1 ? '0回は対象外' : setLoad === null ? '体重未設定' : '重量が対象外'}</span>}
              </span>
              {s.note && <span className="col-span-3 w-full whitespace-pre-wrap break-words text-xs text-muted">{s.note}</span>}
            </button>
            {st === 'failed' && <button type="button" onClick={() => onRetry(s.id)} className="min-h-14 text-xs text-accent">未保存・再試行</button>}
            {editingId === s.id && onSaveNote && onCloseNote && <div id={`set-memo-${s.id}`} className="w-full px-1 pb-1">
              <SetMemoEditor note={s.note} description={`${exerciseNames[id] ?? '種目'} · ${i + 1}set · ${load} × ${s.reps}回`}
                onSave={note => onSaveNote(s.id, note)} onDismiss={onCloseNote} />
            </div>}
          </SwipeRow>
        })}
      </ul>
    </section>)}
    <p className="text-center text-xs text-muted">タップでメモ、左にスワイプで削除</p>
    {sets.some(s => s.reps > 10 && s.reps <= 30) && <p className="text-xs leading-relaxed text-muted">11〜30回の推定1RMはEpley式の参考値です。BIG3・ランキングには使用しません。</p>}
  </div>
}
