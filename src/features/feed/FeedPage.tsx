import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toMessage } from '../../lib/errors'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { fetchFeed, type FeedItem } from './queries'
import { WorkoutCard } from './WorkoutCard'

export function FeedPage() {
  const { show } = useToast()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  // トーストは6秒で自然消滅するため、消えた後も画面に残る「取得失敗」の
  // 事実を items とは別に持つ。これが無いと、失敗直後の一瞬を見逃した人には
  // 「誰も記録していない」と「取得に失敗した」が同じ空表示に見えてしまう。
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchFeed()
      .then((data) => setItems(data))
      .catch((e: unknown) => {
        const message = toMessage(e)
        setError(message)
        show(message)
      })
      .finally(() => setLoading(false))
  }, [show])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-4">
      <Link
        to="/log"
        className="mb-6 flex min-h-16 w-full items-center justify-center rounded-xl bg-accent text-xl font-semibold tracking-wide text-white active:brightness-90"
      >
        トレーニング開始
      </Link>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="flex flex-col gap-3 py-8">
          <p role="alert" className="text-center text-sm text-muted">
            {error}
          </p>
          <Button variant="ghost" onClick={load}>
            再試行
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <WorkoutCard key={item.workout_id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
