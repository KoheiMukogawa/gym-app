import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { fetchPolls, pollMessage, type Poll } from './queries'

const CHANGED_EVENT = 'glog-polls-changed'

/** 投票したことを、ヘッダーのメニューや起動時のシートに知らせる */
export function notifyPollsChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

/**
 * 始まっている投票。アプリを開いたとき・戻ってきたとき・投票したときに取り直す。
 * 失敗しても画面は止めず、それまでの結果を残す（error に理由を入れる）。
 */
export function usePolls(): { polls: Poll[] | null; error: string | null; refresh: () => void } {
  const { userId } = useSession()
  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const refresh = useCallback(() => setAttempt((n) => n + 1), [])
  useEffect(() => {
    setPolls(null)
    setError(null)
    if (!userId) return
    let active = true, latest = 0
    const load = () => {
      const request = ++latest
      Promise.resolve().then(fetchPolls)
        .then((items) => { if (active && request === latest) { setPolls(items); setError(null) } })
        .catch((e: unknown) => { if (active && request === latest) setError(pollMessage(e)) })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    load()
    window.addEventListener(CHANGED_EVENT, load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.removeEventListener(CHANGED_EVENT, load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, attempt])
  return { polls, error, refresh }
}
