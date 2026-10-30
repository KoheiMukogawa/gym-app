import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { adminMessage } from '../../lib/errors'
import { fetchGrowthStats, fetchUsageStats, formatDelta, formatRate, formatSource, formatWeek, perPerson, type GrowthStats, type UsageStats, type UsageWeek } from './usageQueries'

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
  return <section className="space-y-6 p-4">
    <div>
      <h1 className="text-2xl font-semibold">利用状況</h1>
      <p className="mt-1 text-xs leading-relaxed text-muted">ワークアウトを記録した日を、使った日として数えています。テスト用アカウントは含みません。</p>
    </div>
    <GrowthSection monthlyActive={stats.active_30d} totalUsers={stats.total_users} />
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">記録した人数（週ごと）</figcaption>
      <ActiveUsersChart weeks={stats.weeks} />
    </figure>
    <WeeklyDetails weeks={stats.weeks} />
  </section>
}

// Loaded separately: its failure (or a database without the function yet) must not hide the rest.
function GrowthSection({ monthlyActive, totalUsers }: { monthlyActive: number; totalUsers: number }) {
  const [growth, setGrowth] = useState<GrowthStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null); setGrowth(null)
    fetchGrowthStats().then(setGrowth).catch((e: unknown) => setError(adminMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  return <section aria-labelledby="growth-title" className="space-y-5">
    <h2 id="growth-title" className="sr-only">直近の指標</h2>
    {error ? <div className="space-y-3">
      <p role="alert" className="text-sm text-muted">{error}</p>
      <Button variant="ghost" onClick={load}>再試行</Button>
    </div> : !growth ? <Spinner /> : <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">直近7日間</h3>
        <dl className="grid grid-cols-2 gap-3">{([
          ['記録した人', growth.weekly_active_lifters, '人', growth.previous_weekly_active_lifters],
          ['2日以上記録', growth.lifters_2plus_days_7d, '人', growth.previous_lifters_2plus_days_7d],
          ['セット数', growth.sets_7d, 'セット', growth.previous_sets_7d],
          ['新規登録', growth.signups_7d, '人', growth.previous_signups_7d],
        ] as const).map(([label, value, unit, previous]) => <div key={label} className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{value}<span className="ml-1 text-xs font-normal text-muted">{unit}</span></dd>
          <Delta current={value} previous={previous} />
          <ComparisonBars current={value} previous={previous} />
        </div>)}</dl>
        <p className="text-xs leading-relaxed text-muted">利用者1人あたり {perPerson(growth.workouts_7d, growth.weekly_active_lifters)}回・{perPerson(growth.sets_7d, growth.weekly_active_lifters)}セット。直近30日の利用者{monthlyActive}人のうち、今週も記録したのは{monthlyActive === 0 ? '—' : `${Math.round((growth.weekly_active_lifters / monthlyActive) * 100)}%`}です。</p>
      </div>
      <ActivationFunnel growth={growth} totalUsers={totalUsers} />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">登録後も記録した人</h3>
        <dl className="grid grid-cols-3 gap-2">{([
          ['翌日', growth.retention.d1], ['7〜13日目', growth.retention.d7], ['30〜36日目', growth.retention.d30],
        ] as const).map(([label, rate]) => <div key={label} className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{formatRate(rate)}</dd>
          {rate.eligible > 0 && rate.eligible < 10 && <p className="mt-1 text-[10px] text-muted">少人数の参考値</p>}
        </div>)}</dl>
      </div>
      <table className="w-full text-sm">
        <caption className="pb-2 text-left text-xs text-muted">登録のきっかけ（直近90日、最初に開いた公開ページ）</caption>
        <tbody>{growth.signups_by_source_90d.length === 0
          ? <tr><td className="py-2 text-muted">まだありません</td></tr>
          : growth.signups_by_source_90d.map((row) => <tr key={row.source} className="border-t border-border">
            <th scope="row" className="py-2 text-left font-normal">{formatSource(row.source)}</th>
            <td className="text-right tabular-nums">{row.signups}人</td>
          </tr>)}</tbody>
      </table>
    </>}
  </section>
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const improved = current > previous
  return <p className={`mt-1 text-[10px] tabular-nums ${improved ? 'text-accent' : 'text-muted'}`}>{formatDelta(current, previous)}</p>
}

function ComparisonBars({ current, previous }: { current: number; previous: number }) {
  const max = Math.max(current, previous, 1)
  return <div className="mt-3 space-y-1.5" aria-hidden="true">
    <div className="flex items-center gap-2"><span className="w-8 text-[10px] text-muted">今回</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-accent" style={{ width: `${(current / max) * 100}%` }} /></div></div>
    <div className="flex items-center gap-2"><span className="w-8 text-[10px] text-muted">前回</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-muted" style={{ width: `${(previous / max) * 100}%` }} /></div></div>
  </div>
}

function ActivationFunnel({ growth, totalUsers }: { growth: GrowthStats; totalUsers: number }) {
  const stages = [
    ['登録', growth.activation.registered],
    ['初回記録', growth.activation.first_workout],
    ['別日に2回目', growth.activation.second_workout_day],
  ] as const
  return <div className="space-y-3">
    <div><h3 className="text-sm font-semibold">記録を始め、続けた人</h3><p className="mt-1 text-xs text-muted">登録者全体の到達状況</p></div>
    <div className="h-44 w-full" aria-hidden="true" data-testid="activation-chart">
      <ResponsiveContainer>
        <BarChart data={stages.map(([label, value]) => ({ label, value }))} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 4 }}>
          <XAxis type="number" domain={[0, Math.max(totalUsers, 1)]} hide />
          <YAxis type="category" dataKey="label" width={84} tick={tick} tickLine={false} axisLine={false} />
          <Bar dataKey="value" fill={BAR} radius={[0, 5, 5, 0]} maxBarSize={24}>
            <LabelList dataKey="value" position="right" fill="#F5F5F5" fontSize={12} formatter={(value) => `${Number(value)}人`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <ol className="grid grid-cols-3 gap-2 text-center">{stages.map(([label, value], index) => {
      const denominator = index === 0 ? totalUsers : stages[index - 1][1]
      const rate = denominator === 0 ? 0 : Math.round((value / denominator) * 100)
      return <li key={label}><span className="block text-[10px] text-muted">{label}</span><strong className="mt-0.5 block text-sm tabular-nums">{value}人</strong>{index > 0 && <span className="block text-[10px] text-muted">前段階の{rate}%</span>}</li>
    })}</ol>
  </div>
}

function WeeklyDetails({ weeks }: { weeks: UsageWeek[] }) {
  return <section aria-labelledby="weekly-title" className="space-y-3">
    <h2 id="weekly-title" className="text-sm font-semibold">週ごとの詳細</h2>
    <div className="space-y-2">{[...weeks].reverse().map((week) => <article key={week.week_start} className="rounded-xl border border-border bg-surface p-3">
      <h3 className="text-sm font-semibold">{formatWeek(week.week_start)}〜</h3>
      <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
        {([['利用者', week.active_users, '人'], ['記録', week.workouts, '回'], ['セット', week.sets, ''], ['登録', week.signups, '人']] as const).map(([label, value, unit]) => <div key={label}>
          <dt className="text-[10px] text-muted">{label}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}{unit}</dd>
        </div>)}
      </dl>
    </article>)}</div>
  </section>
}

function ActiveUsersChart({ weeks }: { weeks: UsageWeek[] }) {
  const data = weeks.map((w) => ({ label: formatWeek(w.week_start), active_users: w.active_users }))
  return <div className="h-48 w-full" aria-hidden="true" data-testid="weekly-active-chart">
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
