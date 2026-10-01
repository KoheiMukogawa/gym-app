import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { localDate } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import { buildWorkoutMarkdown } from '../../lib/exportMarkdown'
import { useSession } from '../auth/SessionProvider'
import { fetchWorkoutsInRange } from '../history/queries'
import { fetchBodyweightLogs } from '../profile/bodyweightQueries'

const field = 'min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg tabular-nums'

function monthsAgo(count: number): string {
  const now = new Date()
  return localDate(new Date(now.getFullYear(), now.getMonth() - count, now.getDate()))
}

export function ExportPage() {
  const { userId } = useSession()
  const today = localDate()
  const [from, setFrom] = useState(() => monthsAgo(1))
  const [to, setTo] = useState(today)
  const [markdown, setMarkdown] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function build() {
    if (!userId || busy) return
    if (from > to) { setError('開始日は終了日より前にしてください'); return }
    setBusy(true); setError(null); setCopied(false)
    try {
      // 終了日を含めたいので、翌日の0時までを取る
      const end = new Date(to + 'T00:00:00')
      end.setDate(end.getDate() + 1)
      const [items, logs] = await Promise.all([
        fetchWorkoutsInRange(userId, new Date(from + 'T00:00:00').toISOString(), end.toISOString()),
        fetchBodyweightLogs(userId),
      ])
      setMarkdown(buildWorkoutMarkdown({ items, bodyweightLogs: logs, from, to }))
    } catch (e) { setError(toMessage(e)) }
    finally { setBusy(false) }
  }

  function download() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `glog-${from}_${to}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
    } catch {
      // 権限やhttps以外では使えない。下の本文を手で選択してもらう。
      setError('コピーできませんでした。下の内容を選択してコピーしてください。')
    }
  }

  return <section className="flex flex-col gap-5 p-4" aria-label="データのエクスポート">
    <header>
      <h1 className="text-2xl font-semibold">データをエクスポート</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        期間を選ぶと、その間の全セットとメモをMarkdownにまとめます。AIに貼って相談するのに使えます。
      </p>
    </header>

    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-2 text-sm text-muted">開始日
        <input type="date" value={from} max={today} disabled={busy} onChange={(e) => setFrom(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-2 text-sm text-muted">終了日
        <input type="date" value={to} max={today} disabled={busy} onChange={(e) => setTo(e.target.value)} className={field} />
      </label>
    </div>

    <div className="flex flex-wrap gap-2">
      {([['今月', localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))],
         ['過去3ヶ月', monthsAgo(3)],
         ['過去1年', monthsAgo(12)],
         ['全期間', '2020-01-01']] as const).map(([label, start]) => (
        <button key={label} type="button" disabled={busy}
          className="min-h-14 flex-1 rounded-xl border border-border px-3 text-sm text-muted disabled:opacity-40"
          onClick={() => { setFrom(start); setTo(today) }}>{label}</button>
      ))}
    </div>

    <Button onClick={() => void build()} disabled={busy}>{busy ? '作成中…' : 'Markdownを作成'}</Button>
    {error && <p role="alert" className="text-sm text-accent">{error}</p>}

    {markdown && <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => void copy()}>{copied ? '✓ コピーしました' : 'コピー'}</Button>
        <Button variant="ghost" onClick={download}>ファイルで保存</Button>
      </div>
      <label className="flex flex-col gap-2 text-sm text-muted">内容
        <textarea readOnly value={markdown} aria-label="エクスポートした内容" rows={16}
          className="w-full rounded-xl border border-border bg-surface p-3 font-mono text-fg" />
      </label>
    </div>}
  </section>
}
