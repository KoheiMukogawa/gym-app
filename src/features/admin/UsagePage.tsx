import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { adminMessage } from '../../lib/errors'
import { fetchUsageStats, formatWeek, type UsageStats, type UsageWeek } from './usageQueries'

// The accent is already validated on the dark surface (see BodyTrendChart).
const BAR = '#E8412F'
const tick = { fill: '#8A8A93', fontSize: 11 }

export function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null); setStats(null)
    fetchUsageStats().then(setStats).catch((e: unknown) => setError(adminMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{error}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!stats) return <Spinner />
  const tiles: [string, number, string][] = [
    ['登録者数', stats.total_users, '人'],
    ['直近7日に記録した人', stats.active_7d, '人'],
    ['直近30日に記録した人', stats.active_30d, '人'],
    ['今週のセット数', stats.weeks.at(-1)?.sets ?? 0, 'セット'],
  ]
  return <section className="space-y-6 p-4">
    <div>
      <h1 className="text-2xl font-semibold">利用状況</h1>
      <p className="mt-1 text-xs leading-relaxed text-muted">ワークアウトを記録した日を、使った日として数えています。テスト用アカウントは含みません。</p>
    </div>
    <dl className="grid grid-cols-2 gap-3">{tiles.map(([label, value, unit]) => <div key={label} className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}<span className="ml-1 text-sm font-normal text-muted">{unit}</span></dd>
    </div>)}</dl>
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">記録した人数（週ごと）</figcaption>
      <ActiveUsersChart weeks={stats.weeks} />
    </figure>
    <table className="w-full text-sm">
      <caption className="sr-only">週ごとの利用状況</caption>
      <thead><tr className="text-xs text-muted">
        <th scope="col" className="py-2 text-left font-normal">週</th>
        <th scope="col" className="text-right font-normal">記録した人</th>
        <th scope="col" className="text-right font-normal">ワークアウト</th>
        <th scope="col" className="text-right font-normal">セット</th>
        <th scope="col" className="text-right font-normal">新規登録</th>
      </tr></thead>
      <tbody>{[...stats.weeks].reverse().map((w) => <tr key={w.week_start} className="border-t border-border">
        <th scope="row" className="py-2 text-left font-normal">{formatWeek(w.week_start)}〜</th>
        <td className="text-right tabular-nums">{w.active_users}</td>
        <td className="text-right tabular-nums">{w.workouts}</td>
        <td className="text-right tabular-nums">{w.sets}</td>
        <td className="text-right tabular-nums">{w.signups}</td>
      </tr>)}</tbody>
    </table>
  </section>
}

function ActiveUsersChart({ weeks }: { weeks: UsageWeek[] }) {
  const data = weeks.map((w) => ({ label: formatWeek(w.week_start), active_users: w.active_users }))
  return <div className="h-48 w-full" aria-hidden="true">
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveEnd" minTickGap={12} />
        <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.06)' }}
          contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F', borderRadius: 12 }}
          labelStyle={{ color: '#F5F5F5' }} itemStyle={{ color: '#F5F5F5' }}
          labelFormatter={(label) => `${label}〜の週`} formatter={(value) => [`${value}人`, '記録した人']} />
        <Bar dataKey="active_users" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}
