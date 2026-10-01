import { useState } from 'react'
import { SwipeRow } from '../../components/SwipeRow'
import type { LoggedSet } from './logReducer'
import type { SetStatus } from './persistence'
import { formatAddedLoad } from '../../lib/bodyweight'
import { AutoGrowTextarea } from '../../components/ui/AutoGrowTextarea'

type Props = {
  sets: LoggedSet[]
  exerciseNames: Record<string, string>
  status: Record<string, SetStatus>
  onDelete: (id: string) => Promise<void> | void
  onRetry: (id: string) => void
  /** Saves a set's memo; reject to keep the editor open. */
  onNote?: (id: string, note: string) => Promise<void>
  deletingId: string | null
  bodyweightIds?: string[]
}

export function SetList({ sets, exerciseNames, status, onDelete, onRetry, onNote, deletingId, bodyweightIds = [] }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  if (!sets.length) return <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
  const ids = [...new Set(sets.map((s) => s.exercise_id))]

  async function save(id: string) {
    if (!onNote || saving) return
    setSaving(true)
    try { await onNote(id, draft); setEditing(null) } catch { /* the caller shows the error; keep the input */ }
    finally { setSaving(false) }
  }

  return <div className="space-y-4">
    {ids.map((id) => <section key={id} className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">{exerciseNames[id] ?? '種目'}</h2>
      <ul className="divide-y divide-border">
        {sets.filter((s) => s.exercise_id === id).sort((a, b) => a.set_index - b.set_index).map((s, i) => {
          const load = bodyweightIds.includes(id) ? formatAddedLoad(s.weight_kg) : `${s.weight_kg}kg`
          const st = status[s.id] ?? 'saved'
          return <SwipeRow key={s.id} label={`${exerciseNames[id] ?? '種目'} ${i + 1}set ${load} × ${s.reps}回を削除`}
            disabled={deletingId !== null} deleting={deletingId === s.id} onDelete={() => onDelete(s.id)}
            className={st === 'pending' ? 'opacity-50' : ''}>
            {/* Tapping a set opens its memo. Pending sets wait until they are saved. */}
            <button type="button" disabled={!onNote || st === 'pending'} aria-expanded={editing === s.id}
              aria-label={`${exerciseNames[id] ?? '種目'} ${i + 1}set ${load} × ${s.reps}回のメモ${s.note ? `: ${s.note}` : 'を追加'}`}
              onClick={() => { if (editing === s.id) { setEditing(null); return } setEditing(s.id); setDraft(s.note ?? '') }}
              className="flex min-h-12 flex-1 flex-wrap items-center justify-between gap-x-2 text-left disabled:cursor-default">
              <span className="text-sm text-muted">{i + 1}set</span>
              <span className="text-lg font-semibold tabular-nums">{bodyweightIds.includes(id)
                ? <>{formatAddedLoad(s.weight_kg)}<span className="text-xs font-normal text-muted"> × </span></>
                : <>{s.weight_kg}<span className="text-xs font-normal text-muted"> kg × </span></>}{s.reps}<span className="text-xs font-normal text-muted"> 回</span></span>
              {s.note && <span className="w-full whitespace-pre-wrap break-words text-xs text-muted">{s.note}</span>}
            </button>
            {st === 'failed' && <button type="button" onClick={() => onRetry(s.id)} className="min-h-14 text-xs text-accent">未保存・再試行</button>}
            {editing === s.id && <form className="flex w-full items-end gap-2 pb-1" onSubmit={(e) => { e.preventDefault(); void save(s.id) }}>
              <AutoGrowTextarea autoFocus maxLength={200} value={draft} disabled={saving} onChange={(e) => setDraft(e.target.value)}
                aria-label="セットのメモ" placeholder="例: フォーム意識、最後は補助あり"
                className="min-h-12 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-3 text-fg" />
              <button type="submit" disabled={saving} className="min-h-12 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? '保存中…' : '保存'}</button>
            </form>}
          </SwipeRow>
        })}
      </ul>
    </section>)}
    <p className="text-center text-xs text-muted">タップでメモ、左にスワイプで削除</p>
  </div>
}
