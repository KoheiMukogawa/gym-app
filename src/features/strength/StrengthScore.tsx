import { strengthTotal } from '../../lib/strength'
import type { StrengthGoal, StrengthSnapshot } from './queries'

// Each lift gets its own shade of the accent so the ring reads as S → B → D.
const lifts = [
  { key: 'squat', label: 'スクワット', opacity: 1 },
  { key: 'bench', label: 'ベンチプレス', opacity: 0.68 },
  { key: 'deadlift', label: 'デッドリフト', opacity: 0.4 },
] as const
// Gap between segments, in pathLength units (the ring is 100).
const GAP = 0.8
const kg = (value: number | null) => value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1)

export function StrengthScore({ snapshot, goal, onEdit }: {
  snapshot: StrengthSnapshot; goal: StrengthGoal | null; onEdit: () => void
}) {
  const total = strengthTotal(lifts.map(({ key }) => snapshot.lifts[key].allTimeE1rm))
  const ratio = total !== null && goal ? Math.min(1, total / goal.target_total_kg) : null
  const remaining = total !== null && goal ? Math.max(0, goal.target_total_kg - total) : null
  // Segments fill toward the goal; without a goal they split the whole ring by share of the total.
  const scale = total === null ? 0 : goal ? Math.max(goal.target_total_kg, total) : total
  let start = 0
  const segments = lifts.map((lift) => {
    const value = snapshot.lifts[lift.key].allTimeE1rm ?? 0
    const length = scale > 0 ? (value / scale) * 100 : 0
    const segment = { ...lift, start, length }
    start += length
    return segment
  })
  return <section className="overflow-hidden rounded-3xl border border-border bg-surface p-5" aria-label="Big3スコア">
    <h2 className="text-sm font-semibold">推定1RM合計</h2>
    <div className="relative mx-auto my-2 aspect-square w-full max-w-72">
      <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="120" cy="120" r="104" fill="none" stroke="#2A2A2F" strokeWidth="10" />
        {total !== null && segments.map((seg) => seg.length > GAP && <circle key={seg.key} cx="120" cy="120" r="104" fill="none"
          stroke="var(--color-accent)" strokeOpacity={seg.opacity} strokeWidth="10" pathLength="100"
          strokeDasharray={`${seg.length - GAP} ${100 - seg.length + GAP}`} strokeDashoffset={-seg.start} />)}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
        <span className="mb-2 text-xs tracking-widest text-muted">BIG 3 TOTAL</span>
        <div className="text-6xl font-semibold tracking-tight tabular-nums">{kg(total)}</div>
        <span className="mt-1 text-sm text-muted">kg</span>
        <span className="mt-4 text-sm text-muted">{goal ? `目標 ${kg(goal.target_total_kg)} kg` : '目標を設定してスタート'}</span>
      </div>
    </div>
    <p className="text-center text-sm" role="status">
      {total === null ? '3種目の1〜10回の記録がそろうと合計を表示します'
        : remaining === null ? '各種目の最高推定1RMを合算'
        : remaining === 0 ? '目標達成！' : <>目標まであと <strong className="tabular-nums">{kg(remaining)} kg</strong><span className="ml-2 text-muted">（{Math.floor((ratio ?? 0) * 100)}%）</span></>}
    </p>
    <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-5">
      {lifts.map(({ key, label, opacity }) => <div key={key} className="text-center">
        <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] text-muted"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent" style={{ opacity }} />{label}</div>
        <span className="text-xl font-semibold tabular-nums">{kg(snapshot.lifts[key].allTimeE1rm)}</span><span className="ml-1 text-xs text-muted">kg</span>
      </div>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 text-xs text-muted">
      {goal && <p>目標期限 {goal.target_date.replaceAll('-', '/')}</p>}
      <button type="button" onClick={onEdit} className="min-h-14 px-2 text-xs text-muted hover:text-fg">{goal ? '目標を変更' : '目標を設定'}</button>
    </div>
  </section>
}
