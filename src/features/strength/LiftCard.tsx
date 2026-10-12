import { useNavigate } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSeenOnce } from '../../lib/motion'
import { e1rmTicks, type LiftSnapshot } from './strengthSnapshot'

function formatKg(value: number | null): string {
  if (value === null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function LiftCard({ lift }: { lift: LiftSnapshot }) {
  const navigate = useNavigate()
  // Recharts draws the line when it mounts, so wait until the chart scrolls into view.
  const [chartRef, chartSeen] = useSeenOnce<HTMLDivElement>()
  const ticks = lift.e1rmPoints.length >= 2 ? e1rmTicks(lift.e1rmPoints.map((point) => point.e1rm)) : []
  const content = (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">{lift.label}</h2>
          {/* 見出しと同じ名前なら繰り返さない。割り当てた別の種目や、見つからないときだけ出す */}
          {lift.exerciseName !== lift.label && <p className="break-words text-xs text-muted">{lift.exerciseName ?? '対象種目が見つかりません'}</p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="1回の最高重量" value={formatKg(lift.pr1rm)} />
        <Metric label="最近の推定MAX" value={formatKg(lift.currentE1rm)} />
        <Metric label="推定MAXの最高" value={formatKg(lift.allTimeE1rm)} />
      </div>

      {lift.e1rmPoints.length >= 2 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-xs text-muted">e1RMの推移</div>
          <div ref={chartRef} className="h-56 w-full">
            {chartSeen && <ResponsiveContainer width="100%" height="100%">
              {/* The overview stays a clean line; a tap opens the exercise page, where days can be inspected. */}
              <LineChart data={lift.e1rmPoints} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                style={lift.exerciseId ? { cursor: 'pointer' } : undefined}
                onClick={() => { if (lift.exerciseId) navigate(`/exercises/${lift.exerciseId}`) }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8A8A93', fontSize: 10 }}
                  tickFormatter={(date: string) => date.slice(5).replace('-', '/')}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: '#8A8A93', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  domain={[ticks[0], ticks[ticks.length - 1]]}
                  ticks={ticks}
                />
                <Tooltip
                  contentStyle={{
                    background: '#17171A',
                    border: '1px solid #2A2A2F',
                    borderRadius: 12,
                    color: '#F5F5F5',
                  }}
                  formatter={(value) => [`${value} kg`, 'e1RM']}
                  labelFormatter={(date) => String(date)}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  stroke="#E8412F"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>}
          </div>
        </div>
      )}
    </div>
  )

  return content
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">
        {value}
        {value !== '—' && <span className="ml-1 text-xs font-normal text-muted">kg</span>}
      </div>
    </div>
  )
}
