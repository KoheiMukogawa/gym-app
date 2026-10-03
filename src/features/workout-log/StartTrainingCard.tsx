import { useEffect, useState } from 'react'
import { FloatingRecordAction } from '../../components/ui/FloatingRecordAction'
import { useSession } from '../auth/SessionProvider'
import { loadDraft } from './persistence'
import { fetchTodayWorkout } from './queries'

/** ホーム下部の記録画面への入口。今日すでに記録があれば「続きを記録」にする。 */
export function StartTrainingCard() {
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
  return <FloatingRecordAction to="/log" label={started ? '続きを記録' : '記録する'}
    ariaLabel={started ? `続きを記録、今日 ${setCount}セット` : '記録する'} />
}
