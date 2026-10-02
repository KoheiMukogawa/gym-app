import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { localDate, workoutDateISO } from '../../lib/dates'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useSession } from '../auth/SessionProvider'
import { WorkoutCard } from '../feed/WorkoutCard'
import { useMonthWorkouts } from './useMonthWorkouts'
import { MonthCalendar } from './MonthCalendar'
import { bodyweightOn, type BodyweightLog } from '../../lib/bodyweight'
import { fetchBodyweightLogs } from '../profile/bodyweightQueries'

export function HistoryPage() {
  const { userId } = useSession()
  const [params, setParams] = useSearchParams()
  let selected = params.get('date') ?? ''
  try { if (selected) workoutDateISO(selected) } catch { selected = '' }
  const [month, setMonth] = useState(() => new Date((selected || localDate()).slice(0, 7) + '-01T12:00:00'))
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([])
  const year = month.getFullYear()
  const number = month.getMonth() + 1
  // 月を切り替えてもカレンダーは消さず、データは裏で取得する（取得済みの月は即表示）
  const { items, loading, error, retry } = useMonthWorkouts(userId, year, number)
  useEffect(() => {
    if (!userId) return
    let active = true
    // 体重は自重種目のボリューム表示にだけ使うので、失敗しても画面は止めない
    fetchBodyweightLogs(userId).then((logs) => { if (active) setBodyweightLogs(logs) }).catch(() => {})
    return () => { active = false }
  }, [userId])
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
  const [dragging, setDragging] = useState(false)
  const [instant, setInstant] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)
  // 指を離したら、今の月をスワイプ方向へ送り出し、次の月を反対側から滑り込ませる
  function slideTo(direction: 1 | -1) {
    const width = calendarRef.current?.offsetWidth || 320
    setDragX(direction > 0 ? -width : width)
    window.setTimeout(() => {
      move(direction)
      setInstant(true)
      setDragX(direction > 0 ? width : -width)
      requestAnimationFrame(() => requestAnimationFrame(() => { setInstant(false); setDragX(0) }))
    }, 140)
  }
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
      setDragging(true)
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
    setDragging(false)
    if (dx <= -60 && !isCurrentMonth) slideTo(1)
    else if (dx >= 60) slideTo(-1)
    else setDragX(0)
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
    {error ? <div className="space-y-3">
      <p role="alert">{error}</p><Button variant="ghost" onClick={retry}>再試行</Button>
    </div> : <>
      <div className="-mx-4 overflow-hidden px-4 py-1">
      <div onPointerDown={swipeDown} onPointerMove={swipeMove} onPointerUp={swipeEnd}
        onPointerCancel={() => { swipeStart.current = null; setDragging(false); setDragX(0) }}
        onClickCapture={(e) => { if (swiped.current) { e.stopPropagation(); e.preventDefault(); swiped.current = false } }}
        ref={calendarRef}
        className={`touch-pan-y select-none ${dragging || instant ? '' : 'transition-transform duration-150 ease-out'}`} style={{ transform: `translateX(${dragX}px)` }}
        aria-label="カレンダー（左右にスワイプで月を切り替え）">
      <MonthCalendar year={year} month={number} activeDates={items.map((item) => localDate(item.performed_at))}
        selectedDate={selected} maxDate={localDate()} onSelect={(date) => setParams({ date }, { replace: true })} />
      </div>
      </div>
      {selected ? <section className="flex flex-col gap-3">
        <h2 className="text-sm text-muted">{selected} の記録</h2>
        {loading && !visible.length ? <Spinner /> : visible.length ? visible.map((item) => <WorkoutCard key={item.workout_id} item={item} editable detailed bodyweight={bodyweightOn(bodyweightLogs, localDate(item.performed_at))} />)
          : <p className="py-4 text-center text-sm text-muted">この日の記録はありません</p>}
        {selected && <Link to={visible.length ? '/history/' + visible[0].workout_id : '/history/new?date=' + selected} className="flex min-h-14 items-center justify-center rounded-xl border border-accent text-accent">＋ この日に記録を追加</Link>}
      </section> : <p className="text-center text-sm text-muted">日付を選ぶと記録を確認・追加できます</p>}
    </>}
  </div>
}
