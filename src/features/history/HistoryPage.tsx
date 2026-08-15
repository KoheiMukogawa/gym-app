import { useCallback, useEffect, useMemo, useState } from 'react'
import { toMessage } from '../../lib/errors'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { useSession } from '../auth/SessionProvider'
import { WorkoutCard } from '../feed/WorkoutCard'
import type { FeedItem } from '../feed/queries'
import { fetchUserWorkouts } from './queries'
import { MonthCalendar } from './MonthCalendar'

export function HistoryPage() {
  const { userId } = useSession()
  const { show } = useToast()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  // トーストは6秒で自然消滅するため、消えた後も画面に残る「取得失敗」の
  // 事実を items とは別に持つ。これが無いと、失敗直後の一瞬を見逃した人には
  // 「自分は一度も記録していない」と「取得に失敗した」が同じ空表示に見えてしまう。
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!userId) return
    setLoading(true)
    setError(null)
    fetchUserWorkouts(userId)
      .then((data) => setItems(data))
      .catch((e: unknown) => {
        const message = toMessage(e)
        setError(message)
        show(message)
      })
      .finally(() => setLoading(false))
  }, [userId, show])

  useEffect(() => {
    load()
  }, [load])

  const now = new Date()
  // toLocaleDateString('sv-SE') はローカルタイムゾーンで YYYY-MM-DD を返す。
  // UTC への変換を挟まないため、日本時間の深夜のトレーニングが前日にずれない。
  const activeDates = useMemo(
    () => items.map((i) => new Date(i.performed_at).toLocaleDateString('sv-SE')),
    [items],
  )

  if (loading) return <Spinner />

  // カレンダーの「トレーニングあり」マークも items から作っているため、
  // エラー時にそのまま出すと「今月は1日も記録が無い」という誤った空表示に
  // 見えてしまう。取得に失敗したときはカレンダーごと再試行表示に差し替える。
  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4 py-8">
        <p role="alert" className="text-center text-sm text-muted">
          {error}
        </p>
        <Button variant="ghost" onClick={load}>
          再試行
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <section>
        <h2 className="mb-3 text-sm text-muted">
          {now.getFullYear()}年{now.getMonth() + 1}月
        </h2>
        <MonthCalendar
          year={now.getFullYear()}
          month={now.getMonth() + 1}
          activeDates={activeDates}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-muted">記録</h2>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
        ) : (
          items.map((item) => <WorkoutCard key={item.workout_id} item={item} />)
        )}
      </section>
    </div>
  )
}
