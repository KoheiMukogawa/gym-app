import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { loadDraft } from '../workout-log/persistence'
import { ANNOUNCEMENTS, unreadAnnouncements, type Announcement } from './announcements'
import { fetchSeenUntil, markAnnouncementsSeen } from './queries'

/**
 * 未読のお知らせを、起動後に1枚のシートで一度だけ出す。記録中は出さず、記録を終えてから出す。
 * 取得や保存の失敗は、出さない・閉じるだけで、利用者の操作を止めない。
 */
export function AnnouncementsGate({ items = ANNOUNCEMENTS }: { items?: Announcement[] }) {
  const { userId } = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [unread, setUnread] = useState<Announcement[]>([])
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    let active = true
    setUnread([]); setClosed(false)
    if (userId) fetchSeenUntil()
      .then((seenUntil) => { if (active && seenUntil) setUnread(unreadAnnouncements(items, seenUntil)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [userId, items])

  const recording = pathname === '/log' || (userId ? (loadDraft(userId)?.state.sets.length ?? 0) > 0 : false)
  if (closed || unread.length === 0 || recording) return null

  function close(to?: string) {
    setClosed(true)
    void markAnnouncementsSeen().catch(() => undefined)
    if (to) navigate(to)
  }
  return <BottomSheet title="新しい機能" onDismiss={() => close()}>
    <div className="space-y-5 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <ul className="space-y-4">{unread.map((a) => <li key={a.id} className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h3 className="font-semibold">{a.title}</h3>
        <p className="text-sm leading-relaxed text-muted">{a.body}</p>
        {a.link && <Button onClick={() => close(a.link!.to)}>{a.link.label}</Button>}
      </li>)}</ul>
      <Button variant="ghost" onClick={() => close()}>閉じる</Button>
    </div>
  </BottomSheet>
}
