import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { toMessage } from '../../lib/errors'
import { WorkoutCard } from '../feed/WorkoutCard'
import type { FeedItem } from '../feed/queries'
import { fetchUserWorkouts } from './queries'

type MemberLocationState = { displayName?: string }

export function MemberDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const location = useLocation()
  const { show } = useToast()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!userId) {
      setError('メンバーを特定できませんでした')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchUserWorkouts(userId)
      .then(setItems)
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

  const locationState = location.state as MemberLocationState | null
  const name = items[0]?.display_name ?? locationState?.displayName ?? 'メンバー'

  return (
    <div className="flex flex-col gap-3 p-4">
      <Link to="/members" className="flex min-h-14 items-center text-sm text-muted">
        ← メンバー
      </Link>
      <h1 className="text-lg font-semibold">{name}</h1>
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="flex flex-col gap-3 py-8">
          <p role="alert" className="text-center text-sm text-muted">
            {error}
          </p>
          {userId && (
            <Button variant="ghost" onClick={load}>
              再試行
            </Button>
          )}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
      ) : (
        items.map((item) => <WorkoutCard key={item.workout_id} item={item} />)
      )}
    </div>
  )
}
