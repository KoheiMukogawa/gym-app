import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { bodyweightOn, type BodyweightLog } from '../../lib/bodyweight'
import { localDate } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import { strengthTotal } from '../../lib/strength'
import { useSession } from '../auth/SessionProvider'
import { WorkoutCard } from '../feed/WorkoutCard'
import { MonthCalendar } from '../history/MonthCalendar'
import { useMonthWorkouts } from '../history/useMonthWorkouts'
import { fetchBodyweightLogs } from '../profile/bodyweightQueries'
import { currentGoal } from '../strength/currentGoal'
import { fetchStrengthGoals, fetchStrengthSnapshot, type StrengthGoal, type StrengthSnapshot } from '../strength/queries'
import { StartTrainingCard } from '../workout-log/StartTrainingCard'

// Same shades as the BIG3 ring so the two screens read alike.
const LIFTS = [
  { key: 'squat', label: 'スクワット', opacity: 1 },
  { key: 'bench', label: 'ベンチプレス', opacity: 0.68 },
  { key: 'deadlift', label: 'デッドリフト', opacity: 0.4 },
] as const
const kg = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

function Big3Bars({ snapshot, goal }: { snapshot: StrengthSnapshot; goal: StrengthGoal | null }) {
  const values = LIFTS.map(({ key }) => snapshot.lifts[key].allTimeE1rm)
  const total = strengthTotal(values)
  const scale = Math.max(1, ...values.map((v) => v ?? 0))
  return <div className="space-y-2.5">
    {LIFTS.map((lift, i) => {
      const value = values[i]
      return <div key={lift.key} className="flex items-center gap-3 text-sm">
        <span className="w-24 shrink-0 text-xs text-muted">{lift.label}</span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${((value ?? 0) / scale) * 100}%`, opacity: lift.opacity }} />
        </div>
        <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{value === null ? '—' : <>{kg(value)}<span className="ml-0.5 text-xs font-normal text-muted">kg</span></>}</span>
      </div>
    })}
    <div className="flex items-baseline justify-between border-t border-border pt-2.5">
      <span className="text-xs text-muted">合計（推定1RM）</span>
      <span className="text-sm">
        <strong className="text-lg tabular-nums">{total === null ? '—' : kg(total)}</strong><span className="ml-0.5 text-xs text-muted">kg</span>
        {goal && total !== null && <span className="ml-2 text-xs text-muted">目標 {kg(goal.target_total_kg)} kg · {Math.min(100, Math.floor((total / goal.target_total_kg) * 100))}%</span>}
      </span>
    </div>
  </div>
}

export function HomePage() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const now = new Date()
  const today = localDate()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { items, loading, error, retry } = useMonthWorkouts(userId, year, month)
  const [snapshot, setSnapshot] = useState<StrengthSnapshot | null>(null)
  const [goal, setGoal] = useState<StrengthGoal | null>(null)
  const [strengthError, setStrengthError] = useState<string | null>(null)
  const [strengthAttempt, setStrengthAttempt] = useState(0)
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([])

  useEffect(() => {
    if (!userId) return
    let active = true
    setStrengthError(null)
    Promise.all([fetchStrengthSnapshot(userId), fetchStrengthGoals(userId)])
      .then(([s, goals]) => { if (active) { setSnapshot(s); setGoal(currentGoal(goals)) } })
      .catch((e) => { if (active) setStrengthError(toMessage(e)) })
    fetchBodyweightLogs(userId).then((logs) => { if (active) setBodyweightLogs(logs) }).catch(() => {})
    return () => { active = false }
  }, [userId, strengthAttempt])

  const gymDays = new Set(items.map((item) => localDate(item.performed_at)))
  const todayItems = items.filter((item) => localDate(item.performed_at) === today)

  return <div className="flex flex-col gap-4 p-4">
    <p className="text-sm text-muted">{now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
    <StartTrainingCard className="" />

    <section aria-label="今日のトレーニング" className="space-y-2">
      <h2 className="text-sm font-semibold">今日のトレーニング</h2>
      {loading && !todayItems.length ? <Spinner /> : todayItems.length
        ? todayItems.map((item) => <WorkoutCard key={item.workout_id} item={item} editable bodyweight={bodyweightOn(bodyweightLogs, today)} />)
        : !error && <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-sm text-muted">まだ記録がありません</p>}
    </section>

    <section aria-label="今月のトレーニング" className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{month}月のトレーニング</h2>
        <p className="text-sm" aria-label={`今月 ${gymDays.size}日トレーニング`}><strong className="text-2xl tabular-nums">{gymDays.size}</strong><span className="ml-1 text-xs text-muted">日</span></p>
      </div>
      {error ? <div className="space-y-2"><p role="alert" className="text-sm text-accent">{error}</p><Button variant="ghost" onClick={retry}>再試行</Button></div>
        : <MonthCalendar compact year={year} month={month} activeDates={[...gymDays]} maxDate={today}
            onSelect={(date) => navigate('/history?date=' + date)} />}
    </section>

    <section aria-label="BIG3" className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">BIG3</h2>
        <Link to="/big3" className="-my-3 flex min-h-14 items-center text-xs text-muted">詳しく見る →</Link>
      </div>
      {strengthError ? <div className="space-y-2"><p role="alert" className="text-sm text-accent">{strengthError}</p><Button variant="ghost" onClick={() => setStrengthAttempt((n) => n + 1)}>再試行</Button></div>
        : snapshot ? <Big3Bars snapshot={snapshot} goal={goal} /> : <Spinner />}
    </section>
  </div>
}
