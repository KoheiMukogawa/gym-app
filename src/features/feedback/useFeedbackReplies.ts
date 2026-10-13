import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { fetchMyFeedback, hasUnseenReply, type MyFeedback } from './queries'

const SEEN_EVENT = 'glog-feedback-replies-seen'

/** 返信を見たことを、ヘッダーの印や起動時のシートに知らせる。 */
export function notifyRepliesSeen() {
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/**
 * 運営の返信のうち、本人がまだ見ていないもの。アプリを開いたとき・戻ってきたとき・見たときに取り直す。
 * 失敗しても利用者の画面は止めず、それまでの結果を残す。
 */
export function useFeedbackReplies(): MyFeedback[] {
  const { userId } = useSession()
  const [unseen, setUnseen] = useState<MyFeedback[]>([])
  useEffect(() => {
    setUnseen([])
    if (!userId) return
    let active = true, latest = 0
    const refresh = () => {
      const request = ++latest
      Promise.resolve().then(fetchMyFeedback)
        .then((items) => { if (active && request === latest) setUnseen(items.filter(hasUnseenReply)) })
        .catch(() => undefined)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener(SEEN_EVENT, refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.removeEventListener(SEEN_EVENT, refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])
  return unseen
}
