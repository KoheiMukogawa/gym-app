import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toMessage } from '../../lib/errors'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { fetchFeed, type FeedItem } from './queries'
import { WorkoutCard } from './WorkoutCard'

export function FeedPage() {
  const { show } = useToast()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFeed()
      .then(setItems)
      .catch((e) => show(toMessage(e)))
      .finally(() => setLoading(false))
  }, [show])

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
