import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DOT_LIMIT, initialRange, isZoomed, panRange, spansYears, trendDate, visiblePoints, zoomRange, type TrendPoint, type TrendRange } from './trend'

const ACCENT = '#E8412F'
const tick = { fill: '#8A8A93', fontSize: 11 }
const Y_AXIS_WIDTH = 36
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 }
/** これだけ動いたら、タップではなく移動とみなす。 */
const MOVE_PX = 8
const DOUBLE_TAP_MS = 300

type Gesture =
  | { kind: 'pinch'; range: TrendRange; distance: number; anchor: number }
  | { kind: 'pan'; range: TrendRange; x: number; y: number; moving: boolean }

/**
 * 推定1RMの推移。2本指で拡大・縮小し、拡大中は1本指で左右に動かす。
 * 上下の動きはページのスクロールに任せる（touch-action: pan-y）。
 */
export function ExerciseTrendChart({ points, selectedDate, onSelectDate }: {
  points: TrendPoint[]; selectedDate: string; onSelectDate: (date: string) => void
}) {
  const count = points.length
  const [range, setRange] = useState(() => initialRange(points))
  // 線を描くアニメーションは開いたときだけ。拡大・移動のたびに描き直すと線が消えて見える。
  const [drawn, setDrawn] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  // 拡大・移動を終えた瞬間のクリックで、指の下の日を選ばないようにする。
  const gesturedAt = useRef(0)
  const lastTap = useRef({ at: 0, x: 0, y: 0 })
  const zoomable = count > 2
  const shown = visiblePoints(points, range)
  const withYear = spansYears(shown)
  const date = (d: string) => trendDate(d, withYear)

  // iPhoneのSafariは2本指の操作でページ全体を拡大するので、グラフの上では止める。
  useEffect(() => {
    const el = box.current
    if (!el || !zoomable) return
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('gesturestart', stop)
    return () => el.removeEventListener('gesturestart', stop)
  }, [zoomable])

  /** 画面上のx座標が、グラフの描画領域のどこか（0〜1）。 */
  function fraction(clientX: number): number {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return 0.5
    const left = rect.left + Y_AXIS_WIDTH + MARGIN.left
    const width = rect.width - Y_AXIS_WIDTH - MARGIN.left - MARGIN.right
    return width > 0 ? Math.min(Math.max((clientX - left) / width, 0), 1) : 0.5
  }

  function plotWidth(): number {
    const rect = box.current?.getBoundingClientRect()
    return rect ? Math.max(rect.width - Y_AXIS_WIDTH - MARGIN.left - MARGIN.right, 1) : 1
  }

  function change(next: TrendRange) {
    gesturedAt.current = Date.now()
    setDrawn(true)
    setRange(next)
  }

  function begin() {
    const list = [...pointers.current.values()]
    if (list.length >= 2) {
      const [a, b] = list
      gesture.current = { kind: 'pinch', range, distance: Math.hypot(a.x - b.x, a.y - b.y), anchor: fraction((a.x + b.x) / 2) }
    } else if (list.length === 1) {
      gesture.current = { kind: 'pan', range, x: list[0].x, y: list[0].y, moving: false }
    } else {
      gesture.current = null
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!zoomable) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    begin()
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const list = [...pointers.current.values()]
    if (g.kind === 'pinch' && list.length >= 2) {
      const [a, b] = list
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance > 0) change(zoomRange(g.range, count, g.distance / distance, g.anchor, fraction((a.x + b.x) / 2)))
    } else if (g.kind === 'pan' && list.length === 1) {
      const dx = list[0].x - g.x
      if (!g.moving && Math.abs(dx) > MOVE_PX && Math.abs(dx) > Math.abs(list[0].y - g.y)) g.moving = true
      if (g.moving && isZoomed(g.range, count)) change(panRange(g.range, count, (-dx / plotWidth()) * (g.range.end - g.range.start)))
    }
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    // 動かさずに離したら、ダブルタップかどうかを見る。
    if (e.type === 'pointerup' && g?.kind === 'pan' && !g.moving && pointers.current.size === 0) {
      const now = Date.now()
      const last = lastTap.current
      if (now - last.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
        change({ start: 0, end: count - 1 })
        lastTap.current = { at: 0, x: 0, y: 0 }
      } else {
        lastTap.current = { at: now, x: e.clientX, y: e.clientY }
      }
    }
    // 2本指から1本離したら、残った指で続けて移動できるようにする。
    begin()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <p className="text-xs tabular-nums text-muted">
          {shown.length > 0 && `${trendDate(shown[0].date, true)}〜${trendDate(shown[shown.length - 1].date, true)}`}
        </p>
        {isZoomed(range, count) && (
          <button type="button" className="min-h-14 rounded-full px-4 text-sm text-muted"
            onClick={() => change({ start: 0, end: count - 1 })}>全期間</button>
        )}
      </div>
      <div ref={box} data-testid="trend-chart" className="h-96 w-full select-none" style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={shown} margin={MARGIN}
            onClick={(state) => {
              if (Date.now() - gesturedAt.current < 500) return
              const d = String(state?.activeLabel ?? '')
              if (shown.some((p) => p.date === d)) onSelectDate(d)
            }}>
            {selectedDate && <ReferenceLine x={selectedDate} stroke={ACCENT} strokeDasharray="3 3" />}
            <CartesianGrid stroke="#2A2A2F" vertical={false} />
            <XAxis dataKey="date" tick={tick} tickFormatter={date} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={Y_AXIS_WIDTH} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F', borderRadius: 12, color: '#F5F5F5' }}
              labelFormatter={(d) => String(d).replaceAll('-', '/')}
              formatter={(v) => [`${v} kg`, '推定1RM']}
            />
            <Line type="monotone" dataKey="e1rm" stroke={ACCENT} strokeWidth={2}
              dot={shown.length > DOT_LIMIT ? false : { r: 3, fill: ACCENT }}
              activeDot={{ r: 5, fill: ACCENT, stroke: '#17171A', strokeWidth: 2 }}
              isAnimationActive={!drawn} onAnimationEnd={() => setDrawn(true)} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted">
        {zoomable && '2本指で拡大・縮小、拡大中は左右になぞって前後へ移動できます（ダブルタップで全期間）。'}
        グラフをタップすると、その日の記録を表示します。
      </p>
    </div>
  )
}
