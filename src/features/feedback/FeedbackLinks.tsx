import { Link } from 'react-router-dom'
import { useFeedbackInbox } from './useFeedbackInbox'

/** プロフィール画面の「ご意見」欄。管理者にだけ、届いた意見への入口と新着の件数を出す。 */
export function FeedbackLinks() {
  const unread = useFeedbackInbox()
  return <div className="space-y-2 border-t border-border pt-5">
    <h2 className="text-sm font-semibold">ご意見</h2>
    <Link to="/feedback" className="flex min-h-14 items-center text-sm text-accent">ご意見・不具合を送る →</Link>
    {unread !== null && <Link to="/admin/feedback" className="flex min-h-14 items-center gap-2 text-sm text-accent">
      届いた意見 →{unread > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">新着 {unread}</span>}
    </Link>}
  </div>
}
