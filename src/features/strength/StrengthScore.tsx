import type { StrengthGoal, StrengthSnapshot } from './queries'

const lifts = [
  { key: 'squat', label: 'スクワット', color: '#F97360' },
  { key: 'bench', label: 'ベンチプレス', color: '#F4B860' },
  { key: 'deadlift', label: 'デッドリフト', color: '#7BB8F5' },
] as const
const kg = (value: number | null) => value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1)

export function StrengthScore({ snapshot, goal, onEdit }: {
  snapshot: StrengthSnapshot; goal: StrengthGoal | null; onEdit: () => void
}) {
  const total = snapshot.prTotal
  const ratio = total !== null && goal ? Math.min(1, total / goal.target_total_kg) : null
  const remaining = total !== null && goal ? Math.max(0, goal.target_total_kg - total) : null
  const scale = Math.max(total ?? 0, goal?.target_total_kg ?? 0, 1)
  let offset = 0
  return <section className="overflow-hidden rounded-3xl border border-border bg-surface p-5" aria-label="Big3スコア">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold">自己ベスト合計</h2>
      <button type="button" onClick={onEdit} className="min-h-14 text-sm text-accent">{goal ? '目標を変更' : '目標を設定'}</button>
    </div>
    <div className="relative mx-auto my-2 aspect-square w-full max-w-72">
      <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="120" cy="120" r="104" fill="none" stroke="#2A2A2F" strokeWidth="10" />
        {ratio !== null && lifts.map(({ key, color }) => {
          const length = ((snapshot.lifts[key].pr1rm ?? 0) / scale) * 100
          const start = offset; offset += length
          return <circle key={key} cx="120" cy="120" r="104" fill="none" stroke={color} strokeWidth="10"
            pathLength="100" strokeDasharray={`${Math.max(0, length - 0.8)} 100`} strokeDashoffset={-start} />
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
        <span className="mb-2 text-xs tracking-widest text-muted">BIG 3 TOTAL</span>
        <div className="text-6xl font-semibold tracking-tight tabular-nums">{kg(total)}</div>
        <span className="mt-1 text-sm text-muted">kg</span>
        <span className="mt-4 text-sm text-muted">{goal ? `目標 ${kg(goal.target_total_kg)} kg` : '目標を設定してスタート'}</span>
      </div>
    </div>
    <p className="text-center text-sm" role="status">
      {total === null ? '3種目の1回挙上の記録がそろうと合計を表示します'
        : remaining === null ? '3種目それぞれの1回挙上の最高重量'
        : remaining === 0 ? '目標達成！' : <>目標まであと <strong className="tabular-nums">{kg(remaining)} kg</strong><span className="ml-2 text-muted">（{Math.floor((ratio ?? 0) * 100)}%）</span></>}
    </p>
    <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-5">
      {lifts.map(({ key, label, color }) => <div key={key} className="text-center">
        <div className="mb-2 text-[11px] text-muted"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{label}</div>
        <span className="text-xl font-semibold tabular-nums">{kg(snapshot.lifts[key].pr1rm)}</span><span className="ml-1 text-xs text-muted">kg</span>
      </div>)}
    </div>
    {goal && <p className="mt-5 text-center text-xs text-muted">目標期限 {goal.target_date.replaceAll('-', '/')}</p>}
  </section>
}
