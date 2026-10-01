import { strengthTotal } from '../../lib/strength'
import type { StrengthGoal, StrengthSnapshot } from './queries'

const lifts = [
  { key: 'squat', label: 'スクワット' },
  { key: 'bench', label: 'ベンチプレス' },
  { key: 'deadlift', label: 'デッドリフト' },
] as const
const kg = (value: number | null) => value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1)

export function StrengthScore({ snapshot, goal, onEdit }: {
  snapshot: StrengthSnapshot; goal: StrengthGoal | null; onEdit: () => void
}) {
  const total = strengthTotal(lifts.map(({ key }) => snapshot.lifts[key].allTimeE1rm))
  const ratio = total !== null && goal ? Math.min(1, total / goal.target_total_kg) : null
  const remaining = total !== null && goal ? Math.max(0, goal.target_total_kg - total) : null
  return <section className="overflow-hidden rounded-3xl border border-border bg-surface p-5" aria-label="Big3スコア">
    <h2 className="text-sm font-semibold">推定1RM合計</h2>
    <div className="relative mx-auto my-2 aspect-square w-full max-w-72">
      <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="120" cy="120" r="104" fill="none" stroke="#2A2A2F" strokeWidth="10" />
        {ratio !== null && <circle cx="120" cy="120" r="104" fill="none" stroke="var(--color-accent)" strokeWidth="10"
          pathLength="100" strokeLinecap="round" strokeDasharray={`${ratio * 100} 100`} />}
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
      {lifts.map(({ key, label }) => <div key={key} className="text-center">
        <div className="mb-2 text-[11px] text-muted">{label}</div>
        <span className="text-xl font-semibold tabular-nums">{kg(snapshot.lifts[key].allTimeE1rm)}</span><span className="ml-1 text-xs text-muted">kg</span>
      </div>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 text-xs text-muted">
      {goal && <p>目標期限 {goal.target_date.replaceAll('-', '/')}</p>}
      <button type="button" onClick={onEdit} className="min-h-14 px-2 text-xs text-muted hover:text-fg">{goal ? '目標を変更' : '目標を設定'}</button>
    </div>
  </section>
}
