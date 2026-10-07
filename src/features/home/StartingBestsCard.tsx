import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { LIFT_KEYS, type StrengthSnapshot } from '../strength/strengthSnapshot'

const key = (userId: string) => `glog:big3-start-dismissed:${userId}`

function readDismissed(userId: string | null): boolean {
  if (!userId) return false
  try { return localStorage.getItem(key(userId)) === '1' } catch { return false }
}

/** For people switching from another app: start from their BIG3 bests instead of an empty history. */
export function StartingBestsCard({ snapshot }: { snapshot: StrengthSnapshot | null }) {
  const { userId } = useSession()
  const [dismissed, setDismissed] = useState(() => readDismissed(userId))
  // Without the BIG3 data we cannot tell "no records" from "failed to load", so show nothing.
  if (!snapshot || dismissed || LIFT_KEYS.some((lift) => snapshot.lifts[lift].allTimeE1rm !== null)) return null

  function dismiss() {
    setDismissed(true)
    try { if (userId) localStorage.setItem(key(userId), '1') } catch { /* stays hidden for this visit */ }
  }

  return <section aria-labelledby="starting-bests-title" className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <h2 id="starting-bests-title" className="font-semibold">前のアプリから乗り換え？</h2>
    <p className="text-sm leading-relaxed text-muted">BIG3のベストを入れると、今日から合計・推定1RM・ランキングが使えます</p>
    <div className="flex gap-2">
      <Link to="/big3/start" className="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-white">ベストを入れて始める</Link>
      <button type="button" onClick={dismiss} className="min-h-14 rounded-xl px-4 text-sm text-muted">閉じる</button>
    </div>
  </section>
}
