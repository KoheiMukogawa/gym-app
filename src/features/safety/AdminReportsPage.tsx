import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { adminMessage } from '../../lib/errors'
import { formatSentAt } from '../feedback/queries'
import { Avatar } from '../profile/Avatar'
import { fetchReports, REPORT_REASONS, RESOLUTION_LABELS, resolveReport, type AdminReport, type ReportAction } from './queries'
import { notifyReportsResolved } from './useReportInbox'

const ACTIONS: { action: ReportAction; label: string; confirm: string | null; confirmLabel: string }[] = [
  { action: 'dismiss', label: '問題なし', confirm: null, confirmLabel: '問題なし' },
  { action: 'reset', label: 'プロフィールを初期化', confirm: '名前を「Glogユーザー」、アイコンを初期のもの、ひとことを空にします。', confirmLabel: '初期化する' },
  { action: 'remove', label: 'ランキングから外す', confirm: 'プロフィールを初期化し、全体ランキングへの参加もやめさせます。', confirmLabel: '外す' },
]

function Profile({ label, name, icon, bio }: { label: string; name?: string | null; icon?: string | null; bio?: string | null }) {
  return <div className="space-y-1">
    <p className="text-xs text-muted">{label}</p>
    <p className="flex items-center gap-2 break-words font-semibold"><Avatar icon={icon ?? undefined} name={name ?? undefined} />{name ?? '（退会済み）'}</p>
    {bio ? <p className="whitespace-pre-wrap break-words text-xs text-muted">ひとこと: {bio}</p> : null}
  </div>
}

/** 届いた通報（管理者だけ）。相手ごとに、未対応の通報をまとめて対応する。24時間以内の対応を目安にする。 */
export function AdminReportsPage() {
  const [items, setItems] = useState<AdminReport[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ target: string; action: ReportAction } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const lock = useRef(false)

  const load = useCallback(() => {
    setLoadError(null); setItems(null)
    fetchReports().then(setItems).catch((e: unknown) => setLoadError(adminMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  async function resolve(item: AdminReport, action: ReportAction) {
    if (lock.current) return
    lock.current = true; setBusy(item.id)
    setRowErrors((errors) => { const next = { ...errors }; delete next[item.id]; return next })
    try {
      await resolveReport(item.target_id, action)
      setConfirming(null)
      notifyReportsResolved()
      fetchReports().then(setItems).catch((e: unknown) => setLoadError(adminMessage(e)))
    } catch (e) {
      setRowErrors((errors) => ({ ...errors, [item.id]: adminMessage(e) }))
    } finally {
      lock.current = false; setBusy(null)
    }
  }

  if (loadError) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{loadError}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!items) return <Spinner />
  const open = items.filter((item) => !item.resolved_at).length
  return <section className="space-y-5 p-4">
    <PageHeader title="届いた通報"><p className="mt-1 text-sm text-muted">未対応 {open}件。24時間以内の対応を目安にしてください。</p></PageHeader>
    {items.length === 0 ? <p className="text-sm text-muted">まだ通報は届いていません</p>
      : <ul className="space-y-3">{items.map((item) => {
        const pending = confirming?.target === item.target_id && !item.resolved_at ? ACTIONS.find((a) => a.action === confirming.action) : undefined
        return <li key={item.id} className={`space-y-3 rounded-xl border p-4 text-sm ${item.resolved_at ? 'border-border bg-surface' : 'border-accent bg-accent/10'}`}>
          <p className="flex justify-between gap-3 text-xs text-muted">
            <span><span className="font-semibold text-fg">{REPORT_REASONS[item.reason] ?? item.reason}</span>（{item.reporter_name ?? '退会済み'}さんから）</span>
            <span>{formatSentAt(item.created_at)}</span>
          </p>
          {item.detail && <p className="whitespace-pre-wrap break-words">{item.detail}</p>}
          <Profile label="通報された時点" name={item.snapshot.display_name} icon={item.snapshot.icon} bio={item.snapshot.bio} />
          <Profile label={`今${item.target_global ? '（全体ランキングに参加中）' : ''}`} name={item.target_name} icon={item.target_icon} bio={item.target_bio} />
          {rowErrors[item.id] && <p role="alert" className="text-sm text-accent">{rowErrors[item.id]}</p>}
          {item.resolved_at ? <p className="text-xs text-muted">対応済み: {item.resolution ? RESOLUTION_LABELS[item.resolution] : ''}（{formatSentAt(item.resolved_at)}）</p>
            : pending?.confirm ? <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm">{pending.confirm}この人への未対応の通報はすべて対応済みになります。</p>
              <Button disabled={busy !== null} onClick={() => void resolve(item, pending.action)}>{busy === item.id ? '対応中…' : pending.confirmLabel}</Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirming(null)}>キャンセル</Button>
            </div>
            : <div className="grid grid-cols-3 gap-1" role="group" aria-label="対応">
              {ACTIONS.map((a) => <button key={a.action} type="button" disabled={busy !== null}
                onClick={() => a.confirm ? setConfirming({ target: item.target_id, action: a.action }) : void resolve(item, a.action)}
                className="min-h-14 rounded-xl border border-border px-1 text-xs disabled:opacity-50">{busy === item.id && !a.confirm ? '対応中…' : a.label}</button>)}
            </div>}
        </li>
      })}</ul>}
    <p className="text-xs leading-relaxed text-muted">写真のファイルは、Supabaseのダッシュボードで avatars から消してください。アカウントの停止・削除もダッシュボードで行います。</p>
  </section>
}
