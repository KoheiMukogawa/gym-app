import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { FEEDBACK_MAX, feedbackMessage, fetchMyFeedback, formatSentAt, sendFeedback, type MyFeedback } from './queries'

export function FeedbackPage() {
  const { show } = useToast()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<MyFeedback[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const lock = useRef(false)
  const load = useCallback(() => {
    setHistoryError(null); setHistory(null)
    fetchMyFeedback().then(setHistory).catch((e: unknown) => setHistoryError(feedbackMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim() || lock.current) return
    lock.current = true; setSending(true); setError(null)
    try {
      const sent = await sendFeedback(body)
      setBody('')
      setHistory((list) => list && [sent, ...list])
      show('送信しました。ありがとうございます')
    } catch (e) {
      setError(feedbackMessage(e))
    } finally {
      setSending(false); lock.current = false
    }
  }

  return <section className="space-y-5 p-4">
    <h1 className="text-2xl font-semibold">ご意見・不具合の報告</h1>
    <p className="text-sm leading-relaxed">気になる点や、こうしてほしいという要望を運営に送れます。内容は運営だけが読み、ほかの利用者には表示されません。個別の返信はできないことがあります。</p>
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <label className="block text-sm text-muted">内容
        <textarea value={body} disabled={sending} maxLength={FEEDBACK_MAX} rows={6} onChange={(e) => setBody(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-surface p-4 text-base text-fg" />
      </label>
      <p className="text-right text-xs text-muted">残り{FEEDBACK_MAX - body.length}文字</p>
      <p className="text-xs leading-relaxed text-muted">不具合の調査のため、お使いのブラウザの情報（機種・OSの種類など）も一緒に送られます。</p>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button type="submit" disabled={sending || !body.trim()}>{sending ? '送信中…' : '送信する'}</Button>
    </form>
    <div className="space-y-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">送った意見</h2>
      {historyError
        ? <div className="space-y-3"><p role="alert" className="text-sm text-muted">{historyError}</p><Button variant="ghost" onClick={load}>再試行</Button></div>
        : !history ? <Spinner />
        : history.length === 0 ? <p className="text-sm text-muted">まだ送った意見はありません</p>
        : <ul className="space-y-3">{history.map((item) => <li key={item.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="whitespace-pre-wrap break-words">{item.body}</p>
            <p className="mt-2 text-xs text-muted">{formatSentAt(item.created_at)}{item.read_at && ' ・ 運営が確認済み'}</p>
          </li>)}</ul>}
    </div>
  </section>
}
