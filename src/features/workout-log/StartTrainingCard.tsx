import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { loadDraft } from './persistence'
import { fetchTodayWorkout } from './queries'

/** ホーム（BIG3）の一番上に置く、記録画面への入口。今日すでに記録があれば「続きを記録」にする。 */
export function StartTrainingCard({ className = 'mx-4 mt-4' }: { className?: string }) {
  const { userId } = useSession()
  const [setCount, setSetCount] = useState(() => (userId ? loadDraft(userId)?.state.sets.length ?? 0 : 0))
  useEffect(() => {
    if (!userId) return
    let active = true
    // 取得に失敗しても入口は使えるので、表示文言の判定だけ諦める
    fetchTodayWorkout(userId).then((today) => { if (active && today) setSetCount((n) => Math.max(n, today.sets.length)) }).catch(() => {})
    return () => { active = false }
  }, [userId])
  const started = setCount > 0
  return <Link to="/log" className={`${className} flex min-h-16 items-center justify-between rounded-2xl bg-accent px-5 font-semibold text-white`}>
    <span className="text-lg">{started ? '続きを記録' : '＋ 本日のトレーニングを追加'}</span>
    <span className="text-sm font-normal opacity-90">{started ? `今日 ${setCount}セット →` : '→'}</span>
  </Link>
}
