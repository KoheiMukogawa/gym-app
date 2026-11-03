import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { loadDraft } from '../workout-log/persistence'
import { ANNOUNCEMENTS, unreadAnnouncements, type Announcement } from './announcements'
import { fetchSeenUntil, markAnnouncementsSeen } from './queries'
import { useLaunchSheet } from '../../lib/launchSheets'

/**
 * 未読のお知らせを、起動後に1枚のシートで一度だけ出す。記録中は出さず、記録を終えてから出す。
 * 取得や保存の失敗は、出さない・閉じるだけで、利用者の操作を止めない。
 * ほかの起動時のシートとは1回の起動で1枚まで（`useLaunchSheet`）。出せなかったときは次の起動で出す。
 */
export function AnnouncementsGate({ items = ANNOUNCEMENTS }: { items?: Announcement[] }) {
  const { userId } = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [unread, setUnread] = useState<Announcement[]>([])
  const [closed, setClosed] = useState(false)
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    let active = true
    setUnread([]); setClosed(false); setChecked(!userId)
    if (userId) fetchSeenUntil()
      .then((seenUntil) => { if (active && seenUntil) setUnread(unreadAnnouncements(items, seenUntil)) })
      .catch(() => undefined)
      .finally(() => { if (active) setChecked(true) })
    return () => { active = false }
  }, [userId, items])

  const recording = pathname === '/log' || (userId ? (loadDraft(userId)?.state.sets.length ?? 0) > 0 : false)
  const wants = !closed && unread.length > 0 && !recording
  const showing = useLaunchSheet('announcements', !checked ? 'checking' : wants ? 'wants' : 'none') && wants
  if (!showing) return null

  function close(to?: string) {
    setClosed(true)
    void markAnnouncementsSeen().catch(() => undefined)
    if (to) navigate(to)
  }
  return <BottomSheet title="新しい機能" closeLabel="閉じる" onDismiss={() => close()}>
    <div className="space-y-5 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <ul className="space-y-4">{unread.map((a) => <li key={a.id} className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h3 className="font-semibold">{a.title}</h3>
        <p className="text-sm leading-relaxed text-muted">{a.body}</p>
        {a.link && <Button onClick={() => close(a.link!.to)}>{a.link.label}</Button>}
      </li>)}</ul>
    </div>
  </BottomSheet>
}
