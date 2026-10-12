import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { loadDraft } from '../workout-log/persistence'
import { canGuideInstall, currentInstallEnv } from './installEnv'
import { guideSeen, onInstallGuideRequest, pendingGuide, type GuideReason } from './installGuide'
import { InstallGuideSheet } from './InstallGuideSheet'

/**
 * 「ホーム画面に追加」の案内。登録の直後に1回、まだブラウザーで使っている人には最初の記録の後にもう1回。
 * メニューやホームのカードからはいつでも開ける。アイコンから開いている人とPCには出さない。記録中は出さない。
 */
export function InstallGate() {
  const { userId } = useSession()
  const { pathname } = useLocation()
  const [env] = useState(currentInstallEnv)
  const [open, setOpen] = useState<GuideReason | 'manual' | null>(null)

  useEffect(() => {
    if (!userId || !canGuideInstall(env)) return
    const check = () => { const reason = pendingGuide(userId); if (reason) setOpen((current) => current ?? reason) }
    check()
    return onInstallGuideRequest((manual) => { if (manual) setOpen('manual'); else check() })
  }, [userId, env])

  const recording = pathname === '/log' || (userId ? (loadDraft(userId)?.state.sets.length ?? 0) > 0 : false)
  if (!userId || !open || !canGuideInstall(env) || (open !== 'manual' && recording)) return null
  return <InstallGuideSheet env={env} onClose={() => { if (open !== 'manual') guideSeen(userId, open); setOpen(null) }} />
}
