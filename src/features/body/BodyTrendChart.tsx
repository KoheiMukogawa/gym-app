import { memo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '../../lib/bodyComposition'

/** Keep the long-history SVG stable while inputs or progressive list counts change. */
export const BodyTrendChart = memo(function BodyTrendChart({ points, unit, showYear }: {
  points: TrendPoint[]; unit: string; showYear: boolean
}) {
  return <div className="h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false}
          tickFormatter={(d: string) => showYear ? d.replaceAll('-', '/') : d.slice(5).replace('-', '/')} minTickGap={24} />
        <YAxis tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false} width={44}
          domain={['dataMin - 1', 'dataMax + 1']} />
        <Tooltip contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F', borderRadius: 12, color: '#F5F5F5' }}
          formatter={(v, name) => [`${v} ${unit}`, name === 'average' ? '7日平均' : '記録']} />
        <Line type="monotone" dataKey="value" stroke="#8A8A93" strokeWidth={1} dot={{ r: 2, fill: '#8A8A93' }} isAnimationActive={false} />
        <Line type="monotone" dataKey="average" stroke="#E8412F" strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
})
