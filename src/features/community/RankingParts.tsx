import { Link } from 'react-router-dom'
import type { Member, RankMetric } from './queries'

const LABELS: Record<RankMetric, string> = { total: 'BIG3合計', growth: '今月の伸び', dots: 'DOTS' }
const DOTS_LEVELS = [
  ['200未満', '初心者'],
  ['200〜300未満', '初級'],
  ['300〜350未満', '中級'],
  ['350〜400未満', '中級上位'],
  ['400〜450未満', '上級'],
  ['450〜500未満', '非常に高いレベル'],
  ['500以上', 'エリート級'],
] as const

export function MetricTabs({ value, onChange }: { value: RankMetric; onChange: (metric: RankMetric) => void }) {
  return <div className="flex border-b border-border">{(Object.keys(LABELS) as RankMetric[]).map((m) =>
    <button key={m} type="button" aria-pressed={value === m} className={`min-h-14 flex-1 text-sm ${value === m ? 'border-b-2 border-accent text-fg' : 'text-muted'}`} onClick={() => onChange(m)}>{LABELS[m]}</button>)}</div>
}

/** Render only after the ranking loaded: a failed load must not read as "not participating". */
export function DotsNotice({ me }: { me: Member | undefined }) {
  return <div className="space-y-3">
    <p className="text-sm leading-relaxed text-muted">DOTSは、体重の違いを補正して筋力を比較するスコアです。高いほど、体重に対して高い筋力があることを示します。</p>
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        スコアの目安
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-xs leading-relaxed text-muted">BIG3（3種目合計）のスコアを基準にした目安です。</p>
        <table aria-label="DOTSスコアの目安" className="w-full text-left text-sm">
          <thead><tr className="border-b border-border text-xs text-muted"><th scope="col" className="pb-2 font-normal">スコア</th><th scope="col" className="pb-2 font-normal">レベル</th></tr></thead>
          <tbody>{DOTS_LEVELS.map(([range, level]) => <tr key={range} className="border-b border-border last:border-0"><th scope="row" className="py-2 pr-3 font-normal tabular-nums">{range}</th><td className="py-2">{level}</td></tr>)}</tbody>
        </table>
        <p className="text-xs leading-relaxed text-muted">DOTSに公式のレベル区分はありません。現在地や成長を知るための参考としてご覧ください。Glogでは推定1RMを使ってスコアを計算しています。</p>
      </div>
    </details>
    <p className="text-xs leading-relaxed text-muted">記録日の前後14日以内の体重でDOTSを計算します。体重の公開に同意した人だけ表示しています。</p>
    {me?.dots_opt_in && me.dots === null
        ? <Link to="/body" className="flex min-h-14 items-center text-sm text-accent">3種目それぞれ、記録日の前後14日以内の体重が必要です</Link>
        : null}
  </div>
}
