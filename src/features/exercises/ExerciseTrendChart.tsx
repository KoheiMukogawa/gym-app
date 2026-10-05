import { useMemo, useRef, useState } from 'react'
import { Brush, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DOT_LIMIT, TREND_PERIODS, initialPeriod, pointsInPeriod, spansYears, trendDate, type TrendPoint } from './trend'

const ACCENT = '#E8412F'
const tick = { fill: '#8A8A93', fontSize: 11 }
/** これより多い日を表示しているときだけ、範囲を絞るスライダーを出す。 */
const BRUSH_MIN = 10

export function ExerciseTrendChart({ points, selectedDate, onSelectDate }: {
  points: TrendPoint[]; selectedDate: string; onSelectDate: (date: string) => void
}) {
  const [months, setMonths] = useState(() => initialPeriod(points))
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  // 線を描くアニメーションは開いたときと期間を変えたときだけ。スライダーを動かすたびに描き直すと線が消えて見える。
  const [drawn, setDrawn] = useState(false)
  // スライダーを離した瞬間のクリックで、指の下の日を選ばないようにする。
  const brushedAt = useRef(0)
  const periodPoints = useMemo(() => pointsInPeriod(points, months), [points, months])
  const shown = range ? periodPoints.slice(range.start, range.end + 1) : periodPoints
  const withYear = spansYears(periodPoints)
  const date = (d: string) => trendDate(d, withYear)

  function choose(next: number | null) {
    setMonths(next)
    setRange(null)
    setDrawn(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="表示期間" className="flex gap-1 rounded-full border border-border p-1">
        {TREND_PERIODS.map((p) => (
          <button key={p.months ?? 'all'} type="button" aria-pressed={months === p.months}
            className={`min-h-14 min-w-0 flex-1 rounded-full text-sm transition-colors ${months === p.months ? 'bg-border font-semibold text-fg' : 'text-muted'}`}
            onClick={() => choose(p.months)}>{p.label}</button>
        ))}
      </div>
      {periodPoints.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">この期間の記録はありません</p>
      ) : (
        <div className={`${periodPoints.length > BRUSH_MIN ? 'h-96' : 'h-80'} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            {/* key: 期間を変えたらスライダーを初期位置に戻し、線を描き直す */}
            <LineChart key={months ?? 'all'} data={periodPoints} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onClick={(state, event) => {
                const target = (event as { target?: unknown } | undefined)?.target
                if (target instanceof Element && target.closest('.recharts-brush')) return
                if (Date.now() - brushedAt.current < 500) return
                const d = String(state?.activeLabel ?? '')
                if (periodPoints.some((p) => p.date === d)) onSelectDate(d)
              }}>
              {selectedDate && <ReferenceLine x={selectedDate} stroke={ACCENT} strokeDasharray="3 3" />}
              <CartesianGrid stroke="#2A2A2F" vertical={false} />
              <XAxis dataKey="date" tick={tick} tickFormatter={date} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F', borderRadius: 12, color: '#F5F5F5' }}
                labelFormatter={(d) => String(d).replaceAll('-', '/')}
                formatter={(v) => [`${v} kg`, '推定1RM']}
              />
              <Line type="monotone" dataKey="e1rm" stroke={ACCENT} strokeWidth={2}
                dot={shown.length > DOT_LIMIT ? false : { r: 3, fill: ACCENT }}
                activeDot={{ r: 5, fill: ACCENT, stroke: '#17171A', strokeWidth: 2 }}
                isAnimationActive={!drawn} onAnimationEnd={() => setDrawn(true)} />
              {periodPoints.length > BRUSH_MIN && (
                <Brush dataKey="date" height={44} travellerWidth={20} stroke="#8A8A93" fill="#17171A" tickFormatter={date}
                  ariaLabel="表示範囲" startIndex={range?.start ?? 0} endIndex={range?.end ?? periodPoints.length - 1} onChange={({ startIndex, endIndex }) => {
                    brushedAt.current = Date.now()
                    if (startIndex !== undefined && endIndex !== undefined) setRange({ start: startIndex, end: endIndex })
                  }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {periodPoints.length > 0 && (
        <p className="text-xs text-muted">
          グラフをタップすると、その日の記録を表示します。{periodPoints.length > BRUSH_MIN && '下のスライダーの両端を動かすと、表示する範囲を絞れます。'}
        </p>
      )}
    </div>
  )
}
