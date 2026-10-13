import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { loadDraft } from '../workout-log/persistence'
import { markRepliesSeen, STATUS_LABELS, type MyFeedback } from './queries'
import { notifyRepliesSeen } from './useFeedbackReplies'

/**
 * 送った意見に運営が返信（または対応状況を更新）したら、起動後に1枚のシートで知らせる。
 * 記録中とご意見の画面では出さない。閉じると見たことにする。保存の失敗は、次回もう一度出るだけ。
 */
export function FeedbackReplyGate({ unseen }: { unseen: MyFeedback[] }) {
  const { userId } = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [closed, setClosed] = useState(false)
  const recording = pathname === '/log' || (userId ? (loadDraft(userId)?.state.sets.length ?? 0) > 0 : false)
  if (closed || unseen.length === 0 || recording || pathname === '/feedback') return null

  function close(to?: string) {
    setClosed(true)
    void markRepliesSeen().then(notifyRepliesSeen, () => undefined)
    if (to) navigate(to)
  }
  return <BottomSheet title="ご意見への返信" description="送っていただいた意見に、運営から返信がありました。" onDismiss={() => close()}>
    <div className="space-y-4 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <ul className="space-y-3">{unseen.map((item) => <li key={item.id} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="line-clamp-2 whitespace-pre-wrap break-words text-muted">{item.body}</p>
        {item.status && <p><span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">{STATUS_LABELS[item.status]}</span></p>}
        {item.reply && <p className="whitespace-pre-wrap break-words leading-relaxed">{item.reply}</p>}
      </li>)}</ul>
      <Button onClick={() => close('/feedback')}>ご意見の画面で見る</Button>
      <Button variant="ghost" onClick={() => close()}>閉じる</Button>
    </div>
  </BottomSheet>
}
