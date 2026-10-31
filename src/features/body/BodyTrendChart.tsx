import { memo, useMemo, useRef, useState } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { CombinedPoint } from '../../lib/bodyComposition'

// Validated as a pair on the dark surface (scripts/validate_palette.js of the dataviz skill).
export const WEIGHT_COLOR = '#E8412F'
export const FAT_COLOR = '#3B82F6'
const WEIGHT = WEIGHT_COLOR
const FAT = FAT_COLOR
const tick = { fill: '#8A8A93', fontSize: 11 }
const oneDecimal = (value: number) => String(Math.round(value * 10) / 10)

/**
 * Weight on the left axis and body fat on the right. The page's legend names each axis in
 * text so the two scales are never told apart by color alone.
 * Keep the long-history SVG stable while inputs or progressive list counts change.
 */
export const BodyTrendChart = memo(function BodyTrendChart({ points, showYear, onSelectDay, onEditDay }: {
  points: CombinedPoint[]; showYear: boolean; onSelectDay?: (date: string) => void
  /** Without it (the landing page preview) the chart only shows values and offers no edit button. */
  onEditDay?: (date: string) => void
}) {
  const hasFat = points.some((p) => p.fat !== null)
  const date = (d: string) => showYear ? d.replaceAll('-', '/') : d.slice(5).replace('-', '/')
  const box = useRef<HTMLDivElement>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const weightDays = useMemo(() => points.filter((p) => p.weight !== null).map((p) => p.date), [points])
  // 期間を変えて選んだ日が見えなくなったら、カードも出さない
  const selectedIndex = selectedDate === null ? -1 : points.findIndex((p) => p.date === selectedDate)
  const selected = selectedIndex < 0 ? null : points[selectedIndex]
  // カードは選んだ点にかぶらない側に出す
  const onLeft = selectedIndex >= points.length / 2
  // Recharts reports the day its tooltip last activated, which can lag behind a quick tap.
  // Pick the weight dot nearest to the tap instead, and fall back to Recharts' label.
  const pick = (activeLabel: string | number | undefined, clientX: number) => {
    const dots = [...(box.current?.querySelectorAll(`.recharts-line-dots circle[fill="${WEIGHT}"]`) ?? [])]
    if (dots.length > 0 && dots.length === weightDays.length && Number.isFinite(clientX)) {
      let nearest = 0, distance = Infinity
      dots.forEach((dot, index) => {
        const bounds = dot.getBoundingClientRect()
        const d = Math.abs(bounds.left + bounds.width / 2 - clientX)
        if (d < distance) { distance = d; nearest = index }
      })
      setSelectedDate(weightDays[nearest]); onSelectDay?.(weightDays[nearest])
    } else if (activeLabel !== undefined) { setSelectedDate(String(activeLabel)); onSelectDay?.(String(activeLabel)) }
  }
  return <div ref={box} className="relative h-56 w-full">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex justify-between text-[10px] text-muted">
        <span>kg</span>{hasFat && <span>%</span>}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 20, right: 0, bottom: 0, left: 0 }} style={{ cursor: 'pointer' }}
          onClick={(state, event) => pick(state.activeLabel, event?.clientX ?? NaN)}>
          <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} tickFormatter={date} minTickGap={24} />
          <YAxis yAxisId="weight" orientation="left" tick={tick} axisLine={false} tickLine={false} width={40}
            domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={oneDecimal} />
          <YAxis yAxisId="fat" orientation="right" hide={!hasFat} tick={tick} axisLine={false} tickLine={false} width={36}
            domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={oneDecimal} />
          {/* The tapped day gets a line; its values and the edit button live in one card below.
              (A Recharts tooltip follows the pointer and is drawn with pointer-events: none, so it
              could show another day than the one being edited and could not hold a button.) */}
          {selected && <ReferenceLine yAxisId="weight" x={selected.date} stroke="#8A8A93" strokeDasharray="3 3" />}
          {/* Daily records are dots only; the 7-day averages are the two lines. */}
          <Line yAxisId="weight" name="体重" dataKey="weight" stroke="none" dot={{ r: 2.5, fill: WEIGHT, stroke: 'none' }}
            activeDot={{ r: 4, fill: WEIGHT, stroke: '#17171A', strokeWidth: 2 }} isAnimationActive={false} />
          <Line yAxisId="weight" name="体重 7日平均" dataKey="weightAverage" stroke={WEIGHT} strokeWidth={2} dot={false}
            connectNulls isAnimationActive={false} />
          <Line yAxisId="fat" name="体脂肪率" dataKey="fat" stroke="none" dot={{ r: 2.5, fill: FAT, stroke: 'none' }}
            activeDot={{ r: 4, fill: FAT, stroke: '#17171A', strokeWidth: 2 }} isAnimationActive={false} />
          <Line yAxisId="fat" name="体脂肪率 7日平均" dataKey="fatAverage" stroke={FAT} strokeWidth={2} dot={false}
            connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      {selected && <section aria-label={`${date(selected.date)}の記録`}
        className={`absolute top-5 z-10 w-48 rounded-2xl border border-border bg-surface p-4 shadow-xl ${onLeft ? 'left-10' : 'right-9'}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold tabular-nums">{date(selected.date)}</p>
          <button type="button" aria-label="閉じる" onClick={() => setSelectedDate(null)}
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-border">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M6 18 18 6" /></svg>
          </button>
        </div>
        {/* その日の実際の値だけを大きく出す（7日平均は線で見る） */}
        <dl className={`mt-2 grid gap-3 ${hasFat ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: WEIGHT }} />体重</dt>
            <dd className="text-xl font-semibold tabular-nums">{selected.weight === null ? '—' : <>{selected.weight}<span className="text-xs font-normal text-muted"> kg</span></>}</dd>
          </div>
          {hasFat && <div>
            <dt className="flex items-center gap-1 text-xs text-muted"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: FAT }} />体脂肪率</dt>
            <dd className="text-xl font-semibold tabular-nums">{selected.fat === null ? '—' : <>{selected.fat}<span className="text-xs font-normal text-muted"> %</span></>}</dd>
          </div>}
        </dl>
        {onEditDay && <button type="button" aria-label={`${date(selected.date)}の記録を編集`} onClick={() => onEditDay(selected.date)}
          className="mt-3 min-h-10 w-full rounded-lg border border-accent/70 text-sm font-semibold text-accent active:bg-accent/10">編集</button>}
      </section>}
  </div>
})
