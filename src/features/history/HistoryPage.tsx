import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toMessage } from '../../lib/errors'
import { localDate, workoutDateISO } from '../../lib/dates'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useSession } from '../auth/SessionProvider'
import { WorkoutCard } from '../feed/WorkoutCard'
import type { FeedItem } from '../feed/queries'
import { fetchMonthWorkouts } from './queries'
import { MonthCalendar } from './MonthCalendar'

export function HistoryPage() {
  const { userId } = useSession()
  const [params, setParams] = useSearchParams()
  let selected = params.get('date') ?? ''
  try { if (selected) workoutDateISO(selected) } catch { selected = '' }
  const [month, setMonth] = useState(() => new Date((selected || localDate()).slice(0, 7) + '-01T12:00:00'))
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const year = month.getFullYear()
  const number = month.getMonth() + 1
  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true); setError(null)
    fetchMonthWorkouts(userId, year, number)
      .then((data) => { if (active) setItems(data) })
      .catch((e) => { if (active) setError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, year, number, attempt])
  const visible = selected ? items.filter((item) => localDate(item.performed_at) === selected) : items
  function move(direction: number) {
    setParams({}, { replace: true })
    setMonth(new Date(year, number - 1 + direction, 1))
  }
  return <div className="flex flex-col gap-6 p-4">
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">トレーニング履歴</h1>
      <Link to={'/history/new' + (selected ? '?date=' + selected : '')} className="flex min-h-14 items-center rounded-xl border border-border px-3 text-sm text-accent">＋ 日付を選んで追加</Link>
    </header>
    <div className="flex items-center justify-between">
      <button aria-label="前の月" className="min-h-14 min-w-14 text-muted" onClick={() => move(-1)}>←</button>
      <h2 className="text-sm text-muted">{year}年{number}月</h2>
      <button aria-label="次の月" disabled={year === new Date().getFullYear() && number === new Date().getMonth() + 1} className="min-h-14 min-w-14 text-muted disabled:opacity-30" onClick={() => move(1)}>→</button>
    </div>
    {loading ? <Spinner /> : error ? <div className="space-y-3">
      <p role="alert">{error}</p><Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>再試行</Button>
    </div> : <>
      <MonthCalendar year={year} month={number} activeDates={items.map((item) => localDate(item.performed_at))}
        selectedDate={selected} maxDate={localDate()} onSelect={(date) => setParams({ date }, { replace: true })} />
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><h2 className="text-sm text-muted">{selected ? selected + ' の記録' : '今月の記録'}</h2>
          {selected && <button className="min-h-14 text-sm text-muted" onClick={() => setParams({}, { replace: true })}>月全体を見る</button>}
        </div>
        {visible.length ? visible.map((item) => <WorkoutCard key={item.workout_id} item={item} editable />)
          : <p className="py-4 text-center text-sm text-muted">{selected ? 'この日の記録はありません' : 'まだ記録がありません'}</p>}
        {selected && <Link to={'/history/new?date=' + selected} className="flex min-h-14 items-center justify-center rounded-xl border border-accent text-accent">＋ この日に記録を追加</Link>}
      </section>
    </>}
  </div>
}
