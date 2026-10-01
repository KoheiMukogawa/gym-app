import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { bodyweightOn, formatAddedLoad, type BodyweightLog } from '../../lib/bodyweight'
import { localDate } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import { estimateOneRepMax, strengthTotal } from '../../lib/strength'
import { useSession } from '../auth/SessionProvider'
import type { FeedItem } from '../feed/queries'
import { MonthCalendar } from '../history/MonthCalendar'
import { useMonthWorkouts } from '../history/useMonthWorkouts'
import { fetchBodyweightLogs } from '../profile/bodyweightQueries'
import { currentGoal } from '../strength/currentGoal'
import { fetchStrengthGoals, fetchStrengthSnapshot, type StrengthGoal, type StrengthSnapshot } from '../strength/queries'
import { StartTrainingCard } from '../workout-log/StartTrainingCard'

const LIFTS = [
  { key: 'squat', label: 'スクワット' },
  { key: 'bench', label: 'ベンチプレス' },
  { key: 'deadlift', label: 'デッドリフト' },
] as const
const kg = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

/** Right-hand column next to the calendar: BIG3 total and each lift's estimated 1RM. */
function Big3Column({ snapshot, goal }: { snapshot: StrengthSnapshot; goal: StrengthGoal | null }) {
  const values = LIFTS.map(({ key }) => snapshot.lifts[key].allTimeE1rm)
  const total = strengthTotal(values)
  return <Link to="/big3" aria-label="BIG3の詳細へ" className="flex h-full flex-col gap-1.5">
    <div className="flex-1 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] text-muted">BIG3合計</p>
      <p className="text-2xl font-semibold leading-tight tabular-nums">{total === null ? '—' : kg(total)}<span className="ml-0.5 text-xs font-normal text-muted">kg</span></p>
      {goal && total !== null && <p className="text-[11px] text-muted">目標 {kg(goal.target_total_kg)} · {Math.min(100, Math.floor((total / goal.target_total_kg) * 100))}%</p>}
    </div>
    {LIFTS.map((lift, i) => <div key={lift.key} className="flex-1 rounded-xl border border-border px-3 py-1.5">
      <p className="text-[11px] text-muted">{lift.label}</p>
      <p className="text-lg font-semibold leading-tight tabular-nums">{values[i] === null ? '—' : kg(values[i]!)}<span className="ml-0.5 text-[11px] font-normal text-muted">kg</span></p>
    </div>)}
  </Link>
}

/** Today's sets grouped by exercise, numbered like a training log: "1  58.0 kg × 10 reps". */
function TodayWorkout({ item, bodyweight }: { item: FeedItem; bodyweight: number | null }) {
  const groups: { id: string; name: string; bodyweight: boolean; sets: FeedItem['sets'] }[] = []
  for (const set of item.sets) {
    const group = groups.find((g) => g.id === set.exercise_id)
    if (group) group.sets.push(set)
    else groups.push({ id: set.exercise_id, name: set.exercise_name, bodyweight: !!set.is_bodyweight, sets: [set] })
  }
  return <Link to={`/history/${item.workout_id}`} aria-label="今日の記録を編集" className="flex flex-col gap-2">
    {groups.map((group) => {
      const loads = group.sets.map((s) => s.weight_kg + (group.bodyweight ? bodyweight ?? 0 : 0))
      const rms = group.sets.map((s, i) => estimateOneRepMax(loads[i], s.reps)).filter((v): v is number => v !== null)
      return <section key={group.id} className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">{group.name}</h3>
          {rms.length > 0 && <span className="shrink-0 text-sm text-muted">RM <strong className="text-fg tabular-nums">{kg(Math.max(...rms))}</strong> kg</span>}
        </div>
        <ol className="space-y-0.5 text-sm tabular-nums">
          {group.sets.map((s, i) => <li key={i} className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-2">
            <span className="text-muted">{i + 1}</span>
            <span>{group.bodyweight ? formatAddedLoad(s.weight_kg) : `${s.weight_kg.toFixed(1)} kg`}</span>
            <span><span className="text-muted">×</span> {s.reps} <span className="text-xs text-muted">reps</span></span>
            {s.note && <span className="col-start-2 col-end-4 break-words text-xs text-muted">{s.note}</span>}
          </li>)}
        </ol>
      </section>
    })}
  </Link>
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

  const trainedDays = [...new Set(items.map((item) => localDate(item.performed_at)))]
  const todayItems = items.filter((item) => localDate(item.performed_at) === today)

  return <div className="flex flex-col gap-4 p-4">
    <div className="grid grid-cols-[3fr_2fr] gap-3">
      <section aria-label="今月のトレーニング">
        <h2 className="mb-2 text-xl font-semibold tabular-nums">{year}年{month}月</h2>
        {error ? <div className="space-y-2"><p role="alert" className="text-sm text-accent">{error}</p><Button variant="ghost" onClick={retry}>再試行</Button></div>
          : <MonthCalendar compact year={year} month={month} activeDates={trainedDays} selectedDate={today} maxDate={today}
              onSelect={(date) => navigate('/history?date=' + date)} />}
      </section>
      <section aria-label="BIG3">
        {strengthError ? <div className="space-y-2"><p role="alert" className="text-xs text-accent">{strengthError}</p><Button variant="ghost" onClick={() => setStrengthAttempt((n) => n + 1)}>再試行</Button></div>
          : snapshot ? <Big3Column snapshot={snapshot} goal={goal} /> : <Spinner />}
      </section>
    </div>

    <StartTrainingCard className="" />

    <section aria-label="今日のトレーニング" className="space-y-2">
      <h2 className="text-sm font-semibold">今日のトレーニング</h2>
      {loading && !todayItems.length ? <Spinner /> : todayItems.length
        ? todayItems.map((item) => <TodayWorkout key={item.workout_id} item={item} bodyweight={bodyweightOn(bodyweightLogs, today)} />)
        : !error && <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-sm text-muted">まだ記録がありません</p>}
    </section>
  </div>
}
