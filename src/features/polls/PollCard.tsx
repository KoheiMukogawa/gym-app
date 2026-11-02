import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { deadlineLabel, isOpen, pollMessage, showsResults, votePoll, type Poll } from './queries'
import { notifyPollsChanged } from './usePolls'

/**
 * 1つの投票。まだなら選択肢を選んで投票し、投票した後（と締め切った後）は結果を出す。
 * 結果は票数と割合だけで、誰がどれを選んだかは出さない。
 */
export function PollCard({ poll, onVoted }: { poll: Poll; onVoted?: (optionId: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 投票できてから結果を読み直すまでの間、もう一度押せないようにする
  const [voted, setVoted] = useState(false)
  const open = isOpen(poll)
  const results = showsResults(poll)

  async function vote() {
    const option = poll.options.find((o) => o.id === selected)
    if (!option || voting) return
    if (!window.confirm(`「${option.label}」に投票します。投票はあとから変えられません。`)) return
    setVoting(true)
    setError(null)
    try {
      await votePoll(poll.id, option.id)
      setVoted(true)
      onVoted?.(option.id)
      notifyPollsChanged()
    } catch (e) {
      setError(pollMessage(e))
      // 締め切りや投票済みで断られたときも、最新の状態を読み直す
      notifyPollsChanged()
    } finally {
      setVoting(false)
    }
  }

  return <article aria-label={poll.question} className="space-y-4 rounded-2xl border border-border bg-surface p-4">
    <header className="space-y-2">
      <p className={`text-xs font-semibold ${open ? 'text-accent' : 'text-muted'}`}>{open ? `受付中・${deadlineLabel(poll)}まで` : '締め切りました'}</p>
      <h2 className="text-lg font-semibold leading-snug">{poll.question}</h2>
      {poll.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{poll.description}</p>}
    </header>
    {results ? <Results poll={poll} /> : voted ? <p role="status" className="text-sm text-muted">投票しました。結果を読み込み中…</p> : <>
      <div role="radiogroup" aria-label={poll.question} className="space-y-2">
        {poll.options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={selected === o.id} disabled={voting}
          onClick={() => setSelected(o.id)}
          className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left font-semibold transition-colors ${selected === o.id ? 'border-accent bg-accent/10' : 'border-border active:bg-border'}`}>
          <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected === o.id ? 'border-accent' : 'border-muted'}`}>
            {selected === o.id && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
          </span>
          {o.label}
        </button>)}
      </div>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button data-button-key="vote-poll" disabled={!selected || voting} onClick={() => void vote()}>{voting ? '投票中…' : '投票する'}</Button>
      <p className="text-xs text-muted">投票は1マッチョ1回で、あとから変えられません。投票すると結果を見られます。</p>
    </>}
  </article>
}

function Results({ poll }: { poll: Poll }) {
  const total = poll.total_votes ?? 0
  const top = Math.max(0, ...poll.options.map((o) => o.votes ?? 0))
  return <div className="space-y-3">
    <ul aria-label="結果" className="space-y-3">
      {poll.options.map((o) => {
        const votes = o.votes ?? 0
        const share = total ? Math.round((votes / total) * 100) : 0
        const mine = poll.my_option === o.id
        return <li key={o.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-semibold">{o.label}{mine && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">あなたの投票</span>}</span>
            <span className="shrink-0 tabular-nums"><span className="font-semibold">{share}%</span><span className="ml-1.5 text-xs text-muted">{votes}票</span></span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div className={`h-full rounded-full ${votes > 0 && votes === top ? 'bg-accent' : 'bg-muted'}`} style={{ width: `${share}%` }} />
          </div>
        </li>
      })}
    </ul>
    <p className="text-xs text-muted">{total}人のマッチョが投票。誰がどれを選んだかは表示しません。</p>
  </div>
}
