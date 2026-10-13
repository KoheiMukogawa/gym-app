import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { feedbackMessage, fetchAllFeedback, formatSentAt, markFeedbackRead, replyFeedback, REPLY_MAX, STATUS_LABELS, type AdminFeedback, type FeedbackStatus } from './queries'
import { notifyFeedbackRead } from './useFeedbackInbox'

const STATUSES = Object.keys(STATUS_LABELS) as FeedbackStatus[]

/** 状態と返信。送った人の「ご意見」画面に出て、次に開いたときシートで知らされる。 */
function ReplyEditor({ item, onSaved }: { item: AdminFeedback; onSaved: (answer: Pick<AdminFeedback, 'status' | 'reply' | 'replied_at' | 'read_at'>) => void }) {
  const [status, setStatus] = useState<FeedbackStatus | null>(item.status)
  const [reply, setReply] = useState(item.reply ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const changed = status !== item.status || reply.trim() !== (item.reply ?? '')
  async function save() {
    if (!status || lock.current) return
    lock.current = true; setSaving(true); setError(null)
    try {
      const repliedAt = await replyFeedback(item.id, status, reply)
      onSaved({ status, reply: reply.trim() || null, replied_at: repliedAt, read_at: item.read_at ?? new Date().toISOString() })
    } catch (e) {
      setError(feedbackMessage(e))
    } finally {
      lock.current = false; setSaving(false)
    }
  }
  return <div className="space-y-3 border-t border-border pt-3">
    <div className="grid grid-cols-4 gap-1" role="group" aria-label="対応状況">
      {STATUSES.map((s) => <button key={s} type="button" aria-pressed={status === s} disabled={saving} onClick={() => setStatus(s)}
        className={`min-h-14 rounded-xl text-xs ${status === s ? 'bg-accent font-semibold text-white' : 'border border-border text-muted'}`}>{STATUS_LABELS[s]}</button>)}
    </div>
    <label className="block text-xs text-muted">返信（任意）
      <textarea value={reply} disabled={saving} maxLength={REPLY_MAX} rows={3} onChange={(e) => setReply(e.target.value)}
        placeholder="例: ご意見ありがとうございます。1kg刻みに対応しました。"
        className="mt-1 w-full rounded-xl border border-border bg-bg p-3 text-sm text-fg" />
    </label>
    {error && <p role="alert" className="text-sm text-accent">{error}</p>}
    {item.replied_at && !changed && <p className="text-xs text-muted">{formatSentAt(item.replied_at)} に返信済み</p>}
    <Button variant="ghost" disabled={saving || !status || !changed} onClick={() => void save()}>{saving ? '保存中…' : item.replied_at ? '返信を更新' : '返信する'}</Button>
  </div>
}

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
      notifyFeedbackRead()
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
          <ReplyEditor item={item} onSaved={(answer) => {
            setItems((list) => list && list.map((row) => row.id === item.id ? { ...row, ...answer } : row))
            if (!item.read_at) notifyFeedbackRead()
          }} />
        </li>)}</ul>}
  </section>
}
