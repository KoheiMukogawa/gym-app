import { useEffect } from 'react'
import { IS_NATIVE } from '../../lib/native'
import { readHealthState, syncFromHealth } from './nativeHealth'

/** 続けて開き直したときに何度も読まないよう、前回からこの時間がたつまでは読まない。 */
export const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000

/**
 * iPhoneアプリ版で連携中なら、アプリを開いたとき・前に戻ったときに、前回の少し前からの記録を読み込む。
 * 失敗しても画面には出さない（体組成画面の「今すぐ読み込む」でやり直せる）。
 */
export function useHealthAutoSync(userId: string | null, enabled = IS_NATIVE) {
  useEffect(() => {
    if (!enabled || !userId) return
    let running = false
    const run = () => {
      const state = readHealthState(userId)
      if (running || !state.enabled) return
      if (state.lastSyncedAt && Date.now() - new Date(state.lastSyncedAt).getTime() < AUTO_SYNC_INTERVAL_MS) return
      running = true
      syncFromHealth(userId, state.lastSyncedAt).catch(() => undefined).finally(() => { running = false })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    run()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, enabled])
}
