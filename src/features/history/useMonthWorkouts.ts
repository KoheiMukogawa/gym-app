import { useCallback, useEffect, useState } from 'react'
import { toMessage } from '../../lib/errors'
import type { FeedItem } from '../feed/queries'
import { fetchMonthWorkouts } from './queries'

// Months already fetched in this session, shared by Home and History so moving
// between months (or screens) shows the calendar immediately instead of a spinner.
const cache = new Map<string, FeedItem[]>()
const inflight = new Map<string, Promise<FeedItem[]>>()
const keyOf = (userId: string, year: number, month: number) => `${userId}:${year}-${month}`

function load(userId: string, year: number, month: number, force = false): Promise<FeedItem[]> {
  const key = keyOf(userId, year, month)
  const running = inflight.get(key)
  if (running && !force) return running
  const task = Promise.resolve().then(() => fetchMonthWorkouts(userId, year, month))
    .then((items) => { cache.set(key, items); return items })
    .finally(() => inflight.delete(key))
  inflight.set(key, task)
  return task
}

/** Drops cached months so the next read refetches (after a workout is saved or edited). */
export function invalidateMonthWorkouts() {
  cache.clear()
}

/**
 * Workouts for one month. Cached months render at once and refresh in the background;
 * the previous month is prefetched so swiping back feels instant.
 */
export function useMonthWorkouts(userId: string | null, year: number, month: number) {
  const key = userId ? keyOf(userId, year, month) : ''
  const [items, setItems] = useState<FeedItem[]>(() => cache.get(key) ?? [])
  const [loading, setLoading] = useState(() => !cache.has(key))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) return
    let active = true
    const cached = cache.get(key)
    setItems(cached ?? [])
    setLoading(!cached)
    setError(null)
    load(userId, year, month, attempt > 0)
      .then((data) => {
        if (active) setItems(data)
        // 表示中の月がそろってから、前の月を先読みしておく
        const previous = new Date(year, month - 2, 1)
        if (!cache.has(keyOf(userId, previous.getFullYear(), previous.getMonth() + 1))) {
          void load(userId, previous.getFullYear(), previous.getMonth() + 1).catch(() => {})
        }
      })
      .catch((e) => { if (active) setError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, key, year, month, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { items, loading, error, retry }
}
