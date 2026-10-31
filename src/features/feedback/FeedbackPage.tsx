import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { FEEDBACK_MAX, feedbackMessage, fetchMyFeedback, formatSentAt, hasUnseenReply, markRepliesSeen, sendFeedback, STATUS_LABELS, type MyFeedback } from './queries'
import { notifyRepliesSeen } from './useFeedbackReplies'
import { PageHeader } from '../../components/PageHeader'

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
    fetchMyFeedback().then((items) => {
      setHistory(items)
      // 開いた時点で返信を見たことにする。「新しい返信」の印はこの画面にいる間は残す
      if (items.some(hasUnseenReply)) void markRepliesSeen().then(notifyRepliesSeen, () => undefined)
    }).catch((e: unknown) => setHistoryError(feedbackMessage(e)))
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
    <PageHeader title="ご意見・不具合の報告" />
    <p className="text-sm leading-relaxed">気になる点や、こうしてほしいという要望を運営に送れます。内容は運営だけが読み、ほかの利用者には表示されません。運営から返信や対応状況をお知らせすることがあります。</p>
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
            {item.replied_at && <div className="mt-3 space-y-2 border-t border-border pt-3" aria-label="運営からの返信">
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">運営から</span>
                {item.status && <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">{STATUS_LABELS[item.status]}</span>}
                {hasUnseenReply(item) && <span className="text-accent">新しい返信</span>}
                <span className="ml-auto text-muted">{formatSentAt(item.replied_at)}</span>
              </p>
              {item.reply && <p className="whitespace-pre-wrap break-words leading-relaxed">{item.reply}</p>}
            </div>}
          </li>)}</ul>}
    </div>
  </section>
}
