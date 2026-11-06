import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { fetchIsAdmin } from '../feedback/queries'
import { fetchOpenReportCount } from './queries'

const RESOLVED_EVENT = 'glog-reports-resolved'

/** 管理者が通報に対応したことを、ヘッダーの印に知らせる。 */
export function notifyReportsResolved() {
  window.dispatchEvent(new Event(RESOLVED_EVENT))
}

/**
 * 管理者なら未対応の通報の件数、それ以外は null（useFeedbackInbox と同じ考え方）。
 * 失敗しても利用者の画面には影響させず、それまでの件数を残す。
 */
export function useReportInbox(): number | null {
  const { userId } = useSession()
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    setOpen(null)
    if (!userId) return
    let active = true, latest = 0
    const refresh = () => {
      const request = ++latest
      fetchIsAdmin(userId)
        .then((admin) => admin ? fetchOpenReportCount() : null)
        .then((count) => { if (active && request === latest) setOpen(count) })
        .catch(() => undefined)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener(RESOLVED_EVENT, refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.removeEventListener(RESOLVED_EVENT, refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])
  return open
}
