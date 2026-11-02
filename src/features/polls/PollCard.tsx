import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { deadlineLabel, isOpen, pollMessage, showsResults, votePoll, type Poll } from './queries'
import { notifyPollsChanged } from './usePolls'

/**
 * 1つの投票。まだなら選択肢を選んで投票し、投票した後（と締め切った後）は結果を出す。
 * 結果は割合だけで、票数と誰がどれを選んだかは出さない。
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

const MINE = <span className="ml-2 inline-block rounded-full bg-accent/15 px-2 py-0.5 align-middle text-xs font-semibold text-accent">あなたの投票</span>

/** 選択肢ごとの割合（合計がちょうど100%になるよう、最後の選択肢で端数を合わせる） */
function shares(poll: Poll): number[] {
  const total = poll.total_votes ?? 0
  if (!total) return poll.options.map(() => 0)
  const rounded = poll.options.map((o) => Math.round(((o.votes ?? 0) / total) * 100))
  rounded[rounded.length - 1] = 100 - rounded.slice(0, -1).reduce((a, b) => a + b, 0)
  return rounded
}

function Results({ poll }: { poll: Poll }) {
  return poll.options.length === 2 ? <TugOfWar poll={poll} /> : <Bars poll={poll} />
}

/**
 * 2択の結果。1本のゲージを左右の選択肢が引き合う形で出し、割合はゲージの中の両端に書く。
 * 自分が選んだ側を赤くして「あなたの投票」を表す（投票せずに締め切った人には、どちらも赤くしない）。
 * 開いたときは真ん中から動かし、真ん中の印でどちらが優勢かを分かるようにする。票がまだ無いときは五分五分の灰色。
 */
function TugOfWar({ poll }: { poll: Poll }) {
  const [left, right] = poll.options
  const [leftShare, rightShare] = shares(poll)
  const empty = !poll.total_votes
  const [pulled, setPulled] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPulled(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const width = empty || !pulled ? 50 : leftShare
  const leftRed = !empty && poll.my_option === left.id
  const rightRed = !empty && poll.my_option === right.id
  const leftColor = empty ? 'bg-muted/40' : leftRed ? 'bg-accent' : poll.my_option ? 'bg-fg/85' : 'bg-muted'
  const rightColor = empty ? 'bg-muted/25' : rightRed ? 'bg-accent' : 'bg-fg/85'
  // 端の数字が反対側の色に乗るほど片方が細いときは、乗った側の色で読める文字色にする
  const FITS = 18
  const leftOn = width >= FITS ? leftRed : rightRed
  const rightOn = 100 - width >= FITS ? rightRed : leftRed
  const textOn = (red: boolean) => (empty ? 'text-fg/70' : red ? 'text-white' : 'text-bg')
  const mine = <span className="sr-only">あなたの投票</span>
  return <div className="space-y-2">
    {/* 割合と自分の投票はゲージで見せるので、読み上げ用にだけ選択肢の横にも置く */}
    <ul aria-label="結果" className="grid grid-cols-2 gap-3">
      <li className="min-w-0 font-semibold">
        {left.label}<span className="sr-only">{leftShare}%</span>{poll.my_option === left.id && mine}
      </li>
      <li className="min-w-0 text-right font-semibold">
        {right.label}<span className="sr-only">{rightShare}%</span>{poll.my_option === right.id && mine}
      </li>
    </ul>
    <div aria-hidden="true" className="relative flex h-10 overflow-hidden rounded-full bg-border">
      <div className={`h-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${leftColor}`} style={{ width: `${width}%` }} />
      <div className={`h-full flex-1 ${rightColor}`} />
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-bg/70" />
      <span className={`absolute inset-y-0 left-4 flex items-center text-lg font-bold tabular-nums transition-colors duration-700 ${textOn(leftOn)}`}>{leftShare}%</span>
      <span className={`absolute inset-y-0 right-4 flex items-center text-lg font-bold tabular-nums transition-colors duration-700 ${textOn(rightOn)}`}>{rightShare}%</span>
    </div>
  </div>
}

/** 3択以上の結果。選択肢ごとに横棒を並べ、いちばん多いものを赤くする */
function Bars({ poll }: { poll: Poll }) {
  const values = shares(poll)
  const top = Math.max(0, ...poll.options.map((o) => o.votes ?? 0))
  return <ul aria-label="結果" className="space-y-3">
    {poll.options.map((o, i) => {
      const votes = o.votes ?? 0
      return <li key={o.id} className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-semibold">{o.label}{poll.my_option === o.id && MINE}</span>
          <span className="shrink-0 font-semibold tabular-nums">{values[i]}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div className={`h-full rounded-full ${votes > 0 && votes === top ? 'bg-accent' : 'bg-muted'}`} style={{ width: `${values[i]}%` }} />
        </div>
      </li>
    })}
  </ul>
}
