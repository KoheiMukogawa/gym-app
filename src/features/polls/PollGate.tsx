import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { useSession } from '../auth/SessionProvider'
import { useLaunchSheet } from '../../lib/launchSheets'
import { loadDraft } from '../workout-log/persistence'
import { PollCard } from './PollCard'
import { awaitsVote, type Poll } from './queries'

// 起動時のシートは投票ごとに1回だけ。出した投票のIDを端末に残す
const shownKey = (userId: string) => `glog:poll-sheet:${userId}`
function readShown(userId: string | null): string[] {
  if (!userId) return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem(shownKey(userId)) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

/**
 * 受付中でまだ投票していない投票を、起動後に1枚のシートで一度だけ出す。その場で投票でき、投票すると結果に変わる。
 * 記録中・投票の画面では出さない。ほかの起動時のシートとは1回の起動で1枚まで（`useLaunchSheet`）。
 * 閉じたら次からは出さない（メニューの印は残る）。
 */
export function PollGate({ polls }: { polls: Poll[] | null }) {
  const { userId } = useSession()
  const { pathname } = useLocation()
  const [shown, setShown] = useState(() => readShown(userId))
  // 投票した後も結果を見せるため、出した投票はシートを閉じるまで出し続ける
  const [activeId, setActiveId] = useState<string | null>(null)
  const recording = pathname === '/log' || (userId ? (loadDraft(userId)?.state.sets.length ?? 0) > 0 : false)
  const candidate = polls?.find((p) => awaitsVote(p) && !shown.includes(p.id))
  const wants = activeId !== null || (!!candidate && !recording && pathname !== '/polls')
  const allowed = useLaunchSheet('poll', polls === null ? 'checking' : wants ? 'wants' : 'none')
  const poll = polls?.find((p) => p.id === activeId) ?? (activeId === null && allowed && wants ? candidate : undefined)
  const pollId = poll?.id ?? null
  useEffect(() => { if (activeId === null && pollId) setActiveId(pollId) }, [activeId, pollId])
  if (!poll || !userId) return null

  function close() {
    const next = [...shown.filter((id) => id !== poll!.id), poll!.id]
    setShown(next)
    setActiveId(null)
    try { localStorage.setItem(shownKey(userId!), JSON.stringify(next)) } catch { /* shown again next launch */ }
  }
  return <BottomSheet title="マッチョ会議" closeLabel="閉じる" onDismiss={() => close()}>
    <div className="space-y-4 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <PollCard key={poll.id} poll={poll} />
      {poll.my_option === null && <p className="text-center text-xs text-muted">あとで投票するときは、右上のメニューの「投票」から開けます</p>}
    </div>
  </BottomSheet>
}
