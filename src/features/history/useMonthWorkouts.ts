import { useCallback, useEffect, useState } from 'react'
import { toMessage } from '../../lib/errors'
import { isArray, readCache, removeCache, writeCache } from '../../lib/localCache'
import type { FeedItem } from '../feed/queries'
import { fetchMonthWorkouts } from './queries'

// Months already fetched in this session, shared by Home and History so moving
// between months (or screens) shows the calendar immediately instead of a spinner.
const cache = new Map<string, FeedItem[]>()
const inflight = new Map<string, Promise<FeedItem[]>>()
const keyOf = (userId: string, year: number, month: number) => `${userId}:${year}-${month}`
const cacheName = (year: number, month: number) => `month:${year}-${month}`

/**
 * 今月と先月だけは端末にも残し、アプリを開いた直後のホームと履歴をすぐに出す（そのあと読み直す）。
 * 古い月まで残すと端末の保存場所を使いすぎるので、それより前はこのセッションの中だけ。
 */
function isRecentMonth(year: number, month: number): boolean {
  const now = new Date()
  const index = year * 12 + month - 1
  const current = now.getFullYear() * 12 + now.getMonth()
  return index === current || index === current - 1
}

/** このセッションで読んだ月、なければ端末に残した月 */
function cachedMonth(userId: string, year: number, month: number): FeedItem[] | undefined {
  return cache.get(keyOf(userId, year, month))
    ?? (isRecentMonth(year, month) ? readCache<FeedItem[]>(userId, cacheName(year, month), isArray) : undefined)
}

function load(userId: string, year: number, month: number, force = false): Promise<FeedItem[]> {
  const key = keyOf(userId, year, month)
  const running = inflight.get(key)
  if (running && !force) return running
  const task = Promise.resolve().then(() => fetchMonthWorkouts(userId, year, month))
    .then((items) => {
      cache.set(key, items)
      if (isRecentMonth(year, month)) writeCache(userId, cacheName(year, month), items)
      return items
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, task)
  return task
}

/** Drops cached months so the next read refetches (after a workout is saved or edited). */
export function invalidateMonthWorkouts() {
  cache.clear()
  removeCache((name) => name.startsWith('month:'))
}

/**
 * Workouts for one month. Cached months render at once and refresh in the background;
 * the previous month is prefetched so swiping back feels instant.
 */
export function useMonthWorkouts(userId: string | null, year: number, month: number) {
  const key = userId ? keyOf(userId, year, month) : ''
  const [items, setItems] = useState<FeedItem[]>(() => (userId ? cachedMonth(userId, year, month) : undefined) ?? [])
  const [loading, setLoading] = useState(() => !userId || !cachedMonth(userId, year, month))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) return
    let active = true
    const cached = cachedMonth(userId, year, month)
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
      // 前に読んだ月を出せているときは、読み直しに失敗してもそのまま見せる（電波の弱いジムなど）
      .catch((e) => { if (active && !cached) setError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, key, year, month, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { items, loading, error, retry }
}
