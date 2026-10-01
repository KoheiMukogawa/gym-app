import { useEffect, useRef, useState, type PointerEvent } from 'react'
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
import { bodyweightOn, type BodyweightLog } from '../../lib/bodyweight'
import { fetchBodyweightLogs } from '../profile/bodyweightQueries'

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
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([])
  const year = month.getFullYear()
  const number = month.getMonth() + 1
  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true); setError(null)
    Promise.all([fetchMonthWorkouts(userId, year, number), fetchBodyweightLogs(userId)])
      .then(([data, logs]) => { if (active) { setItems(data); setBodyweightLogs(logs) } })
      .catch((e) => { if (active) setError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, year, number, attempt])
  const visible = selected ? items.filter((item) => localDate(item.performed_at) === selected) : []
  const isCurrentMonth = year === new Date().getFullYear() && number === new Date().getMonth() + 1
  function move(direction: number) {
    if (direction > 0 && isCurrentMonth) return
    setParams({}, { replace: true })
    setMonth(new Date(year, number - 1 + direction, 1))
  }
  // 左右のスワイプで月を切り替える。縦の動きはスクロールとして扱う。
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const [dragX, setDragX] = useState(0)
  function swipeDown(e: PointerEvent<HTMLDivElement>) {
    swipeStart.current = { x: e.clientX, y: e.clientY }
    swiped.current = false
  }
  function swipeMove(e: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current
    if (!start) return
    const dx = e.clientX - start.x, dy = e.clientY - start.y
    if (!swiped.current) {
      if (Math.abs(dx) < 10) return
      if (Math.abs(dy) > Math.abs(dx)) { swipeStart.current = null; return }
      swiped.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    // 未来の月へは進めないので、抵抗をつけて動かす
    setDragX(dx < 0 && isCurrentMonth ? dx / 4 : dx)
  }
  function swipeEnd(e: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || !swiped.current) return
    const dx = e.clientX - start.x
    setDragX(0)
    if (dx <= -60) move(1)
    else if (dx >= 60) move(-1)
  }
  return <div className="flex flex-col gap-6 p-4">
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">トレーニング履歴</h1>
      <Link to={'/history/new' + (selected ? '?date=' + selected : '')} className="flex min-h-14 items-center rounded-xl border border-border px-3 text-sm text-accent">＋ 日付を選んで追加</Link>
    </header>
    <div className="flex items-center justify-between">
      <button aria-label="前の月" className="min-h-14 min-w-14 text-muted" onClick={() => move(-1)}>←</button>
      <h2 className="text-sm text-muted">{year}年{number}月</h2>
      <button aria-label="次の月" disabled={isCurrentMonth} className="min-h-14 min-w-14 text-muted disabled:opacity-30" onClick={() => move(1)}>→</button>
    </div>
    {loading ? <Spinner /> : error ? <div className="space-y-3">
      <p role="alert">{error}</p><Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>再試行</Button>
    </div> : <>
      <div onPointerDown={swipeDown} onPointerMove={swipeMove} onPointerUp={swipeEnd}
        onPointerCancel={() => { swipeStart.current = null; setDragX(0) }}
        onClickCapture={(e) => { if (swiped.current) { e.stopPropagation(); e.preventDefault(); swiped.current = false } }}
        className={`touch-pan-y select-none ${dragX === 0 ? 'transition-transform duration-200' : ''}`} style={{ transform: `translateX(${dragX}px)` }}
        aria-label="カレンダー（左右にスワイプで月を切り替え）">
      <MonthCalendar year={year} month={number} activeDates={items.map((item) => localDate(item.performed_at))}
        selectedDate={selected} maxDate={localDate()} onSelect={(date) => setParams({ date }, { replace: true })} />
      </div>
      {selected ? <section className="flex flex-col gap-3">
        <h2 className="text-sm text-muted">{selected} の記録</h2>
        {visible.length ? visible.map((item) => <WorkoutCard key={item.workout_id} item={item} editable bodyweight={bodyweightOn(bodyweightLogs, localDate(item.performed_at))} />)
          : <p className="py-4 text-center text-sm text-muted">この日の記録はありません</p>}
        {selected && <Link to={visible.length ? '/history/' + visible[0].workout_id : '/history/new?date=' + selected} className="flex min-h-14 items-center justify-center rounded-xl border border-accent text-accent">＋ この日に記録を追加</Link>}
      </section> : <p className="text-center text-sm text-muted">日付を選ぶと記録を確認・追加できます</p>}
    </>}
  </div>
}
