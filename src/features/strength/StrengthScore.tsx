import { useState } from 'react'
import { useRevealProgress } from '../../lib/motion'
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
const FILL_MS = 1000
// 合計を推定1RMで出すか、実際に1回で挙げた重量で出すか。端末に覚える
type TotalMode = 'estimated' | 'actual'
const MODE_KEY = 'glog:big3-total-mode'
function loadMode(): TotalMode {
  try { return localStorage.getItem(MODE_KEY) === 'actual' ? 'actual' : 'estimated' } catch { return 'estimated' }
}
const kg = (value: number | null) => value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1)

export function StrengthScore({ snapshot, goal, onEdit }: {
  snapshot: StrengthSnapshot; goal: StrengthGoal | null
  // Without it (the landing page preview) the goal cannot be changed.
  onEdit?: () => void
}) {
  const progress = useRevealProgress(FILL_MS)
  const [mode, setModeState] = useState<TotalMode>(loadMode)
  function setMode(next: TotalMode) {
    setModeState(next)
    try { localStorage.setItem(MODE_KEY, next) } catch { /* 保存できなくても開いている間は切り替わる */ }
  }
  const valueOf = (key: typeof lifts[number]['key']) => (mode === 'estimated' ? snapshot.lifts[key].allTimeE1rm : snapshot.lifts[key].pr1rm)
  const total = strengthTotal(lifts.map(({ key }) => valueOf(key)))
  const ratio = total !== null && goal ? Math.min(1, total / goal.target_total_kg) : null
  const remaining = total !== null && goal ? Math.max(0, goal.target_total_kg - total) : null
  // Segments fill toward the goal; without a goal they split the whole ring by share of the total.
  const scale = total === null ? 0 : goal ? Math.max(goal.target_total_kg, total) : total
  let start = 0
  const segments = lifts.map((lift) => {
    const value = valueOf(lift.key) ?? 0
    const length = scale > 0 ? (value / scale) * 100 : 0
    const segment = { ...lift, start, length }
    start += length
    return segment
  })
  // On open the ring sweeps from empty, S → B → D, to where the lifts stand.
  const filled = progress * start
  return <section className="overflow-hidden rounded-3xl border border-border bg-surface px-5 pb-2 pt-5" aria-label="Big3スコア">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold tracking-wide">TOTAL</h2>
      {/* 記録画面の kg｜lbs と同じ形の切り替え */}
      <div role="radiogroup" aria-label="合計の種類" className="flex rounded-md bg-accent/20 p-0.5 text-xs">
        {([['estimated', 'e1RM'], ['actual', '1RM']] as const).map(([value, label]) => <button key={value} type="button" role="radio"
          aria-checked={mode === value} onClick={() => setMode(value)}
          className={`min-h-7 rounded px-1.5 font-semibold ${mode === value ? 'bg-accent text-white' : 'text-accent'}`}>{label}</button>)}
      </div>
    </div>
    <div className="relative mx-auto my-2 aspect-square w-full max-w-72">
      <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="120" cy="120" r="104" fill="none" stroke="#2A2A2F" strokeWidth="10" />
        {total !== null && segments.map((seg) => {
          const shown = Math.min(seg.length, Math.max(0, filled - seg.start))
          return shown > GAP && <circle key={seg.key} cx="120" cy="120" r="104" fill="none"
            stroke="var(--color-accent)" strokeOpacity={seg.opacity} strokeWidth="10" pathLength="100"
            strokeDasharray={`${shown - GAP} ${100 - shown + GAP}`} strokeDashoffset={-seg.start} />
        })}
      </svg>
      {/* 数字と単位を1行にし、目標と合わせて中央に置く（数字は中心より少し上になる） */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-7 pt-6 text-center">
        <div className="flex items-baseline gap-1">
          <span className="text-6xl font-semibold leading-none tracking-tight tabular-nums">{kg(total)}</span>
          <span className="text-base text-muted">kg</span>
        </div>
        <span className="mt-3 text-sm text-muted">{goal ? `目標 ${kg(goal.target_total_kg)} kg` : '目標を設定してスタート'}</span>
      </div>
    </div>
    <p className="text-center text-sm" role="status">
      {total === null ? (mode === 'estimated' ? '3種目の1〜10回の記録がそろうと合計を表示します' : '3種目とも1回で挙げた記録がそろうと合計を表示します')
        : remaining === null ? (mode === 'estimated' ? '各種目の最高推定1RMを合算' : '各種目で1回で挙げた最高重量を合算')
        : remaining === 0 ? '目標達成！' : <>目標まであと <strong className="tabular-nums">{kg(remaining)} kg</strong><span className="ml-2 text-muted">（{Math.floor((ratio ?? 0) * 100)}%）</span></>}
    </p>
    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
      {lifts.map(({ key, label, opacity }) => <div key={key} className="text-center">
        <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] text-muted"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent" style={{ opacity }} />{label}</div>
        <span className="text-xl font-semibold tabular-nums">{kg(valueOf(key))}</span><span className="ml-1 text-xs text-muted">kg</span>
      </div>)}
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 text-xs text-muted">
      {goal && <p>目標期限 {goal.target_date.replaceAll('-', '/')}</p>}
      {onEdit && <button type="button" onClick={onEdit} className="min-h-11 px-2 text-xs text-muted hover:text-fg">{goal ? '目標を変更' : '目標を設定'}</button>}
    </div>
  </section>
}
