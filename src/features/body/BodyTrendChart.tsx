import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { CombinedPoint } from '../../lib/bodyComposition'
import { initialRangeForMonths, isZoomed, panRange, spansYears, trendDate, visiblePoints, zoomRange, type TrendRange } from '../exercises/trend'

// Validated as a pair on the dark surface (scripts/validate_palette.js of the dataviz skill).
export const WEIGHT_COLOR = '#E8412F'
export const FAT_COLOR = '#3B82F6'
const WEIGHT = WEIGHT_COLOR
const FAT = FAT_COLOR
const tick = { fill: '#8A8A93', fontSize: 11 }
const oneDecimal = (value: number) => String(Math.round(value * 10) / 10)
const Y_AXIS_WIDTH = 40
const RIGHT_AXIS_WIDTH = 36
const MOVE_PX = 8
const DOUBLE_TAP_MS = 300

type Gesture =
  | { kind: 'pinch'; range: TrendRange; distance: number; anchor: number }
  | { kind: 'pan'; range: TrendRange; x: number; y: number; moving: boolean }

/**
 * Weight on the left axis and body fat on the right. The page's legend names each axis in
 * text so the two scales are never told apart by color alone.
 * Keep the long-history SVG stable while inputs or progressive list counts change.
 */
export const BodyTrendChart = memo(function BodyTrendChart({ points, onSelectDay, onEditDay }: {
  points: CombinedPoint[]; onSelectDay?: (date: string) => void
  /** Without it (the landing page preview) the chart only shows values and offers no edit button. */
  onEditDay?: (date: string) => void
}) {
  const rangePoints = useMemo(() => points.map((p) => ({ date: p.date, e1rm: p.weightAverage ?? p.weight ?? 0 })), [points])
  const [range, setRange] = useState(() => initialRangeForMonths(rangePoints, 3))
  const shown = visiblePoints(points, range)
  const hasFat = shown.some((p) => p.fat !== null)
  const withYear = spansYears(shown)
  const date = (d: string) => trendDate(d, withYear)
  const box = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const gesturedAt = useRef(0)
  const lastTap = useRef({ at: 0, x: 0, y: 0 })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const weightDays = useMemo(() => shown.filter((p) => p.weight !== null).map((p) => p.date), [shown])
  const selectedIndex = selectedDate === null ? -1 : shown.findIndex((p) => p.date === selectedDate)
  const selected = selectedIndex < 0 ? null : shown[selectedIndex]
  // カードは選んだ点にかぶらない側に出す
  const onLeft = selectedIndex >= shown.length / 2
  const zoomable = points.length > 2

  useEffect(() => {
    setRange(initialRangeForMonths(rangePoints, 3))
    setSelectedDate(null)
  }, [rangePoints])

  useEffect(() => {
    const el = box.current
    if (!el || !zoomable) return
    const stop = (event: Event) => event.preventDefault()
    el.addEventListener('gesturestart', stop)
    return () => el.removeEventListener('gesturestart', stop)
  }, [zoomable])

  function fraction(clientX: number): number {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return 0.5
    const width = rect.width - Y_AXIS_WIDTH - RIGHT_AXIS_WIDTH
    return width > 0 ? Math.min(Math.max((clientX - rect.left - Y_AXIS_WIDTH) / width, 0), 1) : 0.5
  }

  function plotWidth(): number {
    const rect = box.current?.getBoundingClientRect()
    return rect ? Math.max(rect.width - Y_AXIS_WIDTH - RIGHT_AXIS_WIDTH, 1) : 1
  }

  function change(next: TrendRange) {
    gesturedAt.current = Date.now()
    setRange(next)
  }

  function begin() {
    const list = [...pointers.current.values()]
    if (list.length >= 2) {
      const [a, b] = list
      gesture.current = { kind: 'pinch', range, distance: Math.hypot(a.x - b.x, a.y - b.y), anchor: fraction((a.x + b.x) / 2) }
    } else if (list.length === 1) {
      gesture.current = { kind: 'pan', range, x: list[0].x, y: list[0].y, moving: false }
    } else gesture.current = null
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!zoomable) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    begin()
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gesture.current
    if (!current) return
    const list = [...pointers.current.values()]
    if (current.kind === 'pinch' && list.length >= 2) {
      const [a, b] = list
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance > 0) change(zoomRange(current.range, points.length, current.distance / distance, current.anchor, fraction((a.x + b.x) / 2)))
    } else if (current.kind === 'pan' && list.length === 1) {
      const dx = list[0].x - current.x
      if (!current.moving && Math.abs(dx) > MOVE_PX && Math.abs(dx) > Math.abs(list[0].y - current.y)) current.moving = true
      if (current.moving && isZoomed(current.range, points.length)) change(panRange(current.range, points.length, (-dx / plotWidth()) * (current.range.end - current.range.start)))
    }
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    const current = gesture.current
    pointers.current.delete(event.pointerId)
    if (event.type === 'pointerup' && current?.kind === 'pan' && !current.moving && pointers.current.size === 0) {
      const now = Date.now()
      const last = lastTap.current
      if (now - last.at < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
        change({ start: 0, end: points.length - 1 })
        lastTap.current = { at: 0, x: 0, y: 0 }
      } else lastTap.current = { at: now, x: event.clientX, y: event.clientY }
    }
    begin()
  }
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
  return <div className="flex flex-col gap-2">
    <div className="flex min-h-14 items-center justify-between gap-2">
      <p className="text-xs tabular-nums text-muted">
        {shown.length > 0 && `${trendDate(shown[0].date, true)}〜${trendDate(shown[shown.length - 1].date, true)}`}
      </p>
      {isZoomed(range, points.length) && <button type="button" className="min-h-14 rounded-full px-4 text-sm text-muted"
        onClick={() => setRange({ start: 0, end: points.length - 1 })}>全期間</button>}
    </div>
    <div ref={box} className="relative -mx-2 h-80 w-[calc(100%+1rem)] select-none" style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 text-[10px] text-muted">
        <span className="absolute left-1 w-10 text-center">kg</span>
        {hasFat && <span className="absolute right-1 w-9 text-center">%</span>}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={shown} margin={{ top: 20, right: 0, bottom: 0, left: 0 }} style={{ cursor: 'pointer' }}
          onClick={(state, event) => { if (Date.now() - gesturedAt.current >= 500) pick(state.activeLabel, event?.clientX ?? NaN) }}>
          <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} tickFormatter={date} minTickGap={24} />
          <YAxis yAxisId="weight" orientation="left" tick={tick} axisLine={false} tickLine={false} width={40}
            domain={['dataMin - 1', 'dataMax + 1']} tickCount={5} allowDecimals={false} tickFormatter={oneDecimal} />
          <YAxis yAxisId="fat" orientation="right" hide={!hasFat} tick={tick} axisLine={false} tickLine={false} width={36}
            domain={['dataMin - 1', 'dataMax + 1']} tickCount={5} allowDecimals={false} tickFormatter={oneDecimal} />
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
  </div>
})
