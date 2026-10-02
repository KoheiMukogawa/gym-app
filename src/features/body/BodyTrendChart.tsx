import { memo, useMemo, useRef } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CombinedPoint } from '../../lib/bodyComposition'

// Validated as a pair on the dark surface (scripts/validate_palette.js of the dataviz skill).
export const WEIGHT_COLOR = '#E8412F'
export const FAT_COLOR = '#3B82F6'
const WEIGHT = WEIGHT_COLOR
const FAT = FAT_COLOR
const tick = { fill: '#8A8A93', fontSize: 11 }
const SERIES_ORDER = ['体重', '体重 7日平均', '体脂肪率', '体脂肪率 7日平均']
const oneDecimal = (value: number) => String(Math.round(value * 10) / 10)

/**
 * Weight on the left axis and body fat on the right. The page's legend names each axis in
 * text so the two scales are never told apart by color alone.
 * Keep the long-history SVG stable while inputs or progressive list counts change.
 */
export const BodyTrendChart = memo(function BodyTrendChart({ points, showYear, onSelectDay }: {
  points: CombinedPoint[]; showYear: boolean; onSelectDay: (date: string) => void
}) {
  const hasFat = points.some((p) => p.fat !== null)
  const date = (d: string) => showYear ? d.replaceAll('-', '/') : d.slice(5).replace('-', '/')
  const box = useRef<HTMLDivElement>(null)
  const weightDays = useMemo(() => points.filter((p) => p.weight !== null).map((p) => p.date), [points])
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
      onSelectDay(weightDays[nearest])
    } else if (activeLabel !== undefined) onSelectDay(String(activeLabel))
  }
  return <div ref={box} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} style={{ cursor: 'pointer' }}
          onClick={(state, event) => pick(state.activeLabel, event?.clientX ?? NaN)}>
          <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} tickFormatter={date} minTickGap={24} />
          <YAxis yAxisId="weight" orientation="left" tick={tick} axisLine={false} tickLine={false} width={40}
            domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={oneDecimal} />
          <YAxis yAxisId="fat" orientation="right" hide={!hasFat} tick={tick} axisLine={false} tickLine={false} width={36}
            domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={oneDecimal} />
          <Tooltip contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F', borderRadius: 12, color: '#F5F5F5', fontSize: 12, padding: '6px 10px' }}
            itemStyle={{ color: '#F5F5F5', padding: 0 }} labelFormatter={(d) => date(String(d))}
            itemSorter={(item) => SERIES_ORDER.indexOf(String(item.name))}
            formatter={(v, name) => [`${v} ${String(name).startsWith('体重') ? 'kg' : '%'}`, name]} />
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
  </div>
})
