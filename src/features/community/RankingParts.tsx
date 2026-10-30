import { Link } from 'react-router-dom'
import type { Member, RankLift, RankMetric } from './queries'
import { DOTS_LEVELS } from '../../lib/dots'

const LABELS: Record<RankMetric, string> = { total: 'BIG3合計', growth: '今月の伸び', dots: 'DOTS' }

export function MetricTabs({ value, onChange }: { value: RankMetric; onChange: (metric: RankMetric) => void }) {
  return <div className="flex border-b border-border">{(Object.keys(LABELS) as RankMetric[]).map((m) =>
    <button key={m} type="button" aria-pressed={value === m} className={`min-h-11 flex-1 text-sm ${value === m ? 'border-b-2 border-accent text-fg' : 'text-muted'}`} onClick={() => onChange(m)}>{LABELS[m]}</button>)}</div>
}

const LIFTS: { key: RankLift | null; label: string }[] = [
  { key: null, label: 'TOTAL' }, { key: 'squat', label: 'スクワット' }, { key: 'bench', label: 'ベンチ' }, { key: 'deadlift', label: 'デッド' },
]

/** Under the kg total, narrows the ranking to one lift's best estimated 1RM. */
export function LiftFilter({ value, onChange }: { value: RankLift | null; onChange: (lift: RankLift | null) => void }) {
  return <div role="group" aria-label="種目" className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-surface p-1">{LIFTS.map(({ key, label }) =>
    <button key={label} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
      className={`min-h-11 min-w-0 whitespace-nowrap rounded-lg px-1 text-xs transition-colors min-[360px]:text-[13px] ${value === key ? 'bg-accent font-semibold text-white shadow-sm' : 'text-muted hover:bg-white/5'}`}>{label}</button>)}</div>
}

/** Render only after the ranking loaded: a failed load must not read as "not participating". */
export function DotsNotice({ me }: { me: Member | undefined }) {
  return <div className="space-y-3">
    <p className="text-xs leading-relaxed text-muted">DOTSは体重差を補正した筋力スコア。記録日の前後14日以内の体重を使い、公開を選んだ人だけ表示します。</p>
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        スコアの目安
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-xs leading-relaxed text-muted">BIG3（3種目合計）のスコアを基準にした目安です。</p>
        <table aria-label="DOTSスコアの目安" className="w-full text-left text-sm">
          <thead><tr className="border-b border-border text-xs text-muted"><th scope="col" className="pb-2 font-normal">スコア</th><th scope="col" className="pb-2 font-normal">レベル</th></tr></thead>
          <tbody>{DOTS_LEVELS.map(([, range, level]) => <tr key={range} className="border-b border-border last:border-0"><th scope="row" className="py-2 pr-3 font-normal tabular-nums">{range}</th><td className="py-2">{level}</td></tr>)}</tbody>
        </table>
        <p className="text-xs leading-relaxed text-muted">DOTSに公式のレベル区分はありません。現在地や成長を知るための参考としてご覧ください。Glogでは推定1RMを使ってスコアを計算しています。</p>
      </div>
    </details>
    {me?.dots_opt_in && me.dots === null
        ? <Link to="/body" className="flex min-h-14 items-center text-sm text-accent">3種目それぞれ、記録日の前後14日以内の体重が必要です</Link>
        : null}
  </div>
}
