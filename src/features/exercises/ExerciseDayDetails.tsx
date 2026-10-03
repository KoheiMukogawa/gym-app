import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { bodyweightOn } from '../../lib/bodyweight'
import { toMessage } from '../../lib/errors'
import { WorkoutSetDetails } from '../feed/WorkoutSetDetails'
import type { FeedItem } from '../feed/queries'
import { fetchWorkoutsInRange } from '../history/queries'
import { fetchBodyweightLogs } from '../profile/bodyweightQueries'
import { useSession } from '../auth/SessionProvider'

export function ExerciseDayDetails({ exerciseId, date }: { exerciseId: string; date: string }) {
  const { userId } = useSession()
  const [items, setItems] = useState<FeedItem[]>([])
  const [bodyweight, setBodyweight] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(null); setItems([]); setBodyweight(null)
    if (!userId) { setLoading(false); return }
    const start = new Date(date + 'T00:00:00')
    const end = new Date(start); end.setDate(end.getDate() + 1)
    fetchWorkoutsInRange(userId, start.toISOString(), end.toISOString()).then(rows => {
      if (!active) return
      setItems(rows.map(item => ({ ...item, sets: item.sets.filter(s => s.exercise_id === exerciseId) })).filter(item => item.sets.length > 0))
    }).catch(e => { if (active) setError(toMessage(e)) }).finally(() => { if (active) setLoading(false) })
    // Bodyweight is supplementary; losing it must not hide the actual sets.
    fetchBodyweightLogs(userId).then(logs => { if (active) setBodyweight(bodyweightOn(logs, date)) }).catch(() => {})
    return () => { active = false }
  }, [userId, exerciseId, date, attempt])
  return <section aria-label="選択日の種目の記録" className="mt-4 space-y-3 border-t border-border pt-4">
    <h3 className="text-sm font-semibold">{date} の記録</h3>
    {loading ? <Spinner /> : error ? <><p role="alert" className="text-sm text-accent">{error}</p><Button variant="ghost" onClick={() => setAttempt(n => n + 1)}>記録を再試行</Button></> : items.length ? items.map(item => <div key={item.workout_id}>
      <WorkoutSetDetails item={item} bodyweight={bodyweight} />
      <Link to={`/history/${item.workout_id}`} className="flex min-h-14 items-center justify-center text-sm text-accent">この日の記録を編集</Link>
    </div>) : <p className="text-sm text-muted">この日のこの種目の記録はありません</p>}
  </section>
}
