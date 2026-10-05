import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { fetchIsAdmin, fetchUnreadFeedbackCount } from './queries'

const READ_EVENT = 'glog-feedback-read'

/** 管理者が意見を既読にしたことを、ヘッダーなどの新着表示に知らせる。 */
export function notifyFeedbackRead() {
  window.dispatchEvent(new Event(READ_EVENT))
}

/**
 * 管理者なら未読の意見の件数、それ以外は null。
 * アプリを開いたとき・戻ってきたとき・既読にしたときに取り直す。
 * 失敗は新着の表示を出さない（それまでの件数があれば残す）だけで、利用者の画面には影響させない。
 */
export function useFeedbackInbox(): number | null {
  const { userId } = useSession()
  const [unread, setUnread] = useState<number | null>(null)
  useEffect(() => {
    setUnread(null)
    if (!userId) return
    let active = true, latest = 0
    const refresh = () => {
      const request = ++latest
      fetchIsAdmin(userId)
        .then((admin) => admin ? fetchUnreadFeedbackCount() : null)
        .then((count) => { if (active && request === latest) setUnread(count) })
        .catch(() => undefined)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener(READ_EVENT, refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.removeEventListener(READ_EVENT, refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])
  return unread
}
