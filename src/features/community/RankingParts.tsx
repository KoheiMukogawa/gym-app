import { Link } from 'react-router-dom'
import type { Member, RankMetric } from './queries'

const LABELS: Record<RankMetric, string> = { total: 'BIG3合計', growth: '今月の伸び', dots: 'DOTS' }

export function MetricTabs({ value, onChange }: { value: RankMetric; onChange: (metric: RankMetric) => void }) {
  return <div className="flex border-b border-border">{(Object.keys(LABELS) as RankMetric[]).map((m) =>
    <button key={m} type="button" aria-pressed={value === m} className={`min-h-14 flex-1 text-sm ${value === m ? 'border-b-2 border-accent text-fg' : 'text-muted'}`} onClick={() => onChange(m)}>{LABELS[m]}</button>)}</div>
}

/** Render only after the ranking loaded: a failed load must not read as "not participating". */
export function DotsNotice({ me }: { me: Member | undefined }) {
  return <div className="space-y-1">
    <p className="text-xs leading-relaxed text-muted">記録日の前後14日以内の体重でDOTSを計算します。体重の公開に同意した人だけ表示しています。</p>
    {!me
      // Only the global list can omit the viewer: it also requires joining the global ranking.
      ? <Link to="/profile" className="flex min-h-14 items-center text-sm text-accent">全体ランキングとDOTSの両方に参加すると表示されます</Link>
      : !me.dots_opt_in
      ? <Link to="/profile" className="flex min-h-14 items-center text-sm text-accent">DOTSランキングへの参加はプロフィールで設定</Link>
      : me.dots === null
        ? <Link to="/body" className="flex min-h-14 items-center text-sm text-accent">3種目それぞれ、記録日の前後14日以内の体重が必要です</Link>
        : null}
  </div>
}
