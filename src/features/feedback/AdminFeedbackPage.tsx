import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { feedbackMessage, fetchAllFeedback, formatSentAt, markFeedbackRead, type AdminFeedback } from './queries'

export function AdminFeedbackPage() {
  const [items, setItems] = useState<AdminFeedback[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  // Ids being marked; the ref stops a second tap before the re-render disables the button.
  const pending = useRef(new Set<string>())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const load = useCallback(() => {
    setLoadError(null); setItems(null)
    fetchAllFeedback().then(setItems).catch((e: unknown) => setLoadError(feedbackMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  async function markRead(id: string) {
    if (pending.current.has(id)) return
    pending.current.add(id); setBusy(new Set(pending.current))
    setRowErrors((errors) => { const next = { ...errors }; delete next[id]; return next })
    try {
      await markFeedbackRead(id)
      const now = new Date().toISOString()
      setItems((list) => list && list.map((item) => item.id === id ? { ...item, read_at: now } : item))
    } catch (e) {
      setRowErrors((errors) => ({ ...errors, [id]: feedbackMessage(e) }))
    } finally {
      pending.current.delete(id); setBusy(new Set(pending.current))
    }
  }

  if (loadError) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{loadError}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!items) return <Spinner />
  const unread = items.filter((item) => !item.read_at).length
  return <section className="space-y-5 p-4">
    <div>
      <h1 className="text-2xl font-semibold">届いた意見</h1>
      <p className="mt-1 text-sm text-muted">未読 {unread}件</p>
    </div>
    {items.length === 0 ? <p className="text-sm text-muted">まだ意見は届いていません</p>
      : <ul className="space-y-3">{items.map((item) => <li key={item.id}
          className={`space-y-2 rounded-xl border p-4 text-sm ${item.read_at ? 'border-border bg-surface' : 'border-accent bg-accent/10'}`}>
          <p className="flex justify-between gap-3 text-xs text-muted"><span className="font-semibold text-fg">{item.display_name}</span><span>{formatSentAt(item.created_at)}</span></p>
          <p className="whitespace-pre-wrap break-words">{item.body}</p>
          {item.user_agent && <p className="break-all text-xs text-muted">{item.user_agent}</p>}
          {rowErrors[item.id] && <p role="alert" className="text-sm text-accent">{rowErrors[item.id]}</p>}
          {item.read_at ? <p className="text-xs text-muted">既読</p>
            : <Button variant="ghost" disabled={busy.has(item.id)} onClick={() => void markRead(item.id)}>{busy.has(item.id) ? '既読にしています…' : '既読にする'}</Button>}
        </li>)}</ul>}
  </section>
}
