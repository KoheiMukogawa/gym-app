import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { fetchIsAdmin, fetchUnreadFeedbackCount } from './queries'

/** プロフィール画面の「ご意見」欄。管理者にだけ、届いた意見への入口と新着の件数を出す。 */
export function FeedbackLinks() {
  const { userId } = useSession()
  // null: not an admin, or the check failed. A failure only hides the admin entry; the admin
  // notices it on the list screen, and users' screens stay as they were.
  const [unread, setUnread] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    setUnread(null)
    if (userId) fetchIsAdmin(userId)
      .then((admin) => admin ? fetchUnreadFeedbackCount() : null)
      .then((count) => { if (active) setUnread(count) })
      .catch(() => { if (active) setUnread(null) })
    return () => { active = false }
  }, [userId])
  return <div className="space-y-2 border-t border-border pt-5">
    <h2 className="text-sm font-semibold">ご意見</h2>
    <Link to="/feedback" className="flex min-h-14 items-center text-sm text-accent">ご意見・不具合を送る →</Link>
    {unread !== null && <Link to="/admin/feedback" className="flex min-h-14 items-center gap-2 text-sm text-accent">
      届いた意見 →{unread > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">新着 {unread}</span>}
    </Link>}
  </div>
}
