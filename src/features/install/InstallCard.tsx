import { useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { canGuideInstall, currentInstallEnv } from './installEnv'
import { cardDismissed, dismissCard, openInstallGuide } from './installGuide'

/** For people still using Glog in the browser on a phone. */
export function InstallCard() {
  const { userId } = useSession()
  const [hidden, setHidden] = useState(() => !userId || !canGuideInstall(currentInstallEnv()) || cardDismissed(userId))
  if (hidden || !userId) return null
  return <section aria-labelledby="install-card-title" className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <h2 id="install-card-title" className="font-semibold">ホーム画面に追加</h2>
    <p className="text-sm leading-relaxed text-muted">アイコンから1タップで開けて、ジムですぐ記録を始められます</p>
    <div className="flex gap-2">
      <button type="button" onClick={openInstallGuide} className="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-white">追加のしかた</button>
      <button type="button" onClick={() => { dismissCard(userId); setHidden(true) }} className="min-h-14 rounded-xl px-4 text-sm text-muted">閉じる</button>
    </div>
  </section>
}
