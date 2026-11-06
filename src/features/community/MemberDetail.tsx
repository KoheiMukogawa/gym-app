import { useRef, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { IS_DEMO } from '../../lib/demoMode'
import { useSession } from '../auth/SessionProvider'
import { Avatar } from '../profile/Avatar'
import { blockUser, REPORT_DETAIL_MAX, REPORT_REASONS, reportUser, safetyMessage, type ReportReason } from '../safety/queries'
import type { Member } from './queries'

const lifts = [{ key: 'squat', name: 'スクワット' }, { key: 'bench', name: 'ベンチプレス' }, { key: 'deadlift', name: 'デッドリフト' }] as const
const kg = (value: number | null) => value === null ? '—' : `${value} kg`
const REASONS = Object.keys(REPORT_REASONS) as ReportReason[]

type View = 'detail' | 'report' | 'reported' | 'block'

/**
 * ランキングのメンバーの記録。ほかの人には下に「通報する」「ブロックする」を出す（App Storeの審査ガイドライン1.2）。
 * ブロックすると onBlocked で親がその人を一覧から外し、シートを閉じる。
 */
export function MemberDetail({ member, onClose, onBlocked, showHistory = false }: { member: Member; onClose: () => void; onBlocked?: (userId: string) => void; showHistory?: boolean }) {
  const { userId } = useSession()
  const [view, setView] = useState<View>('detail')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  // 自分自身と、紹介ページの見本では出さない
  const canAct = member.user_id !== userId && !IS_DEMO

  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(null)
    try { await action() } catch (e) { setError(safetyMessage(e)) } finally { lock.current = false; setBusy(false) }
  }
  const go = (next: View) => { setError(null); setView(next) }

  const title = <span className="flex min-w-0 items-center gap-2 break-words"><Avatar icon={member.icon} name={member.display_name}/> {member.display_name}</span>
  const body = 'space-y-4 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]'
  const alert = error && <p role="alert" className="text-sm text-accent">{error}</p>

  if (view === 'report') return <BottomSheet title={title} closeLabel="閉じる" onDismiss={onClose} dismissible={!busy}>
    <form className={body} aria-label="通報" onSubmit={(e) => { e.preventDefault(); if (reason) void run(async () => { await reportUser(member.user_id, reason, detail); go('reported') }) }}>
      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-semibold">通報する理由</legend>
        {REASONS.map((r) => <label key={r} className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-4 text-sm has-[:checked]:border-accent">
          <input type="radio" name="report-reason" value={r} checked={reason === r} disabled={busy} onChange={() => setReason(r)} className="accent-[var(--color-accent)]" />
          {REPORT_REASONS[r]}
        </label>)}
      </fieldset>
      <label className="block text-sm">詳しい内容（任意）
        <textarea value={detail} maxLength={REPORT_DETAIL_MAX} rows={3} disabled={busy} onChange={(e) => setDetail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-bg p-3 text-sm text-fg" />
      </label>
      <p className="text-xs leading-relaxed text-muted">運営が内容を確認し、利用規約に反していれば名前や画像を削除します。通報したことは相手に知らされません。</p>
      {alert}
      <Button type="submit" disabled={busy || !reason}>{busy ? '送信中…' : '通報する'}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => go('detail')}>キャンセル</Button>
    </form>
  </BottomSheet>

  if (view === 'reported') return <BottomSheet title={title} closeLabel="閉じる" onDismiss={onClose}>
    <section className={body} aria-label="通報しました">
      <p className="text-sm leading-relaxed">通報しました。運営が確認します。</p>
      <p className="text-sm leading-relaxed text-muted">この人をブロックすると、あなたのランキングに表示されなくなります。</p>
      <Button onClick={() => go('block')}>この人をブロックする</Button>
      <Button variant="ghost" onClick={onClose}>閉じる</Button>
    </section>
  </BottomSheet>

  if (view === 'block') return <BottomSheet title={title} closeLabel="閉じる" onDismiss={onClose} dismissible={!busy}>
    <section className={body} aria-label="ブロック">
      <p className="text-sm leading-relaxed">{member.display_name}さんをブロックしますか？</p>
      <p className="text-sm leading-relaxed text-muted">全体とコミュニティのランキングに表示されなくなります。相手には知らされません。プロフィールの「ブロックした人」から解除できます。</p>
      {alert}
      <Button disabled={busy} onClick={() => void run(async () => { await blockUser(member.user_id); onBlocked?.(member.user_id); onClose() })}>{busy ? 'ブロック中…' : 'ブロックする'}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => go('detail')}>キャンセル</Button>
    </section>
  </BottomSheet>

  return <BottomSheet title={title} closeLabel="閉じる" onDismiss={onClose}>
    <section className={body} aria-label={`${member.display_name}の記録`}>
      {showHistory && member.bio && <p className="break-words text-sm text-muted">{member.bio}</p>}
      {lifts.map((lift) => {
        const points = member.points.filter((point) => point.lift === lift.key)
        return <div key={lift.key}>
          <div className="flex justify-between text-sm"><span>{lift.name}</span><strong>{kg(member.lifts[lift.key])}</strong></div>
          {showHistory && points.length >= 2 && <div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><XAxis dataKey="date" tick={{ fill: '#8A8A93', fontSize: 10 }} tickFormatter={(date: string) => date.slice(5)} /><YAxis hide domain={['dataMin - 5', 'dataMax + 5']} /><Tooltip contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F' }} formatter={(value) => [`${value} kg`, '推定1RM']} /><Line dataKey="value" stroke="var(--color-accent)" dot={false} /></LineChart></ResponsiveContainer></div>}
        </div>
      })}
      {canAct && <div className="flex gap-2 border-t border-border pt-2">
        <button type="button" onClick={() => go('report')} className="min-h-14 flex-1 text-sm text-muted">通報する</button>
        <button type="button" onClick={() => go('block')} className="min-h-14 flex-1 text-sm text-muted">ブロックする</button>
      </div>}
    </section>
  </BottomSheet>
}
