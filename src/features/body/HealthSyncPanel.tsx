import { useEffect, useRef, useState } from 'react'
import guide from '../../../docs/health-sync-shortcut.md?raw'
import guideUrl from '../../../docs/health-sync-shortcut.md?url'
import { Button } from '../../components/ui/Button'
import { toMessage } from '../../lib/errors'
import { fetchHealthSyncStatus, healthSyncEndpoint, issueHealthSyncToken, revokeHealthSyncToken, type HealthSyncStatus } from './healthSyncQueries'

type Props = { userId: string | null; refreshVersion: number; onBusyChange?: (busy: boolean) => void }
type Action = 'issue' | 'revoke'

/** A keyed owner boundary also discards in-flight credentials on logout/user changes. */
export function HealthSyncPanel({ userId, refreshVersion, onBusyChange }: Props) {
  return userId ? <OwnedHealthSyncPanel key={userId} refreshVersion={refreshVersion} onBusyChange={onBusyChange} /> : null
}

function OwnedHealthSyncPanel({ refreshVersion, onBusyChange }: Omit<Props, 'userId'>) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<HealthSyncStatus | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedAction, setFailedAction] = useState<Action | null>(null)
  const [confirmation, setConfirmation] = useState<Action | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    onBusyChange?.(busy)
    return () => { onBusyChange?.(false) }
  }, [busy, onBusyChange])

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    setFailedAction(null)
    fetchHealthSyncStatus()
      .then((value) => { if (active) setStatus(value) })
      .catch((e: unknown) => { if (active) { setStatus(null); setError(toMessage(e)) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, refreshVersion, attempt])

  async function perform(action: Action) {
    if (busy || loading) return
    setBusy(true)
    setToken(null)
    setError(null)
    setCopyMessage(null)
    setConfirmation(null)
    try {
      if (action === 'issue') {
        const issued = await issueHealthSyncToken()
        if (!alive.current) return
        setToken(issued.token)
        setStatus((previous) => ({ enabled: true, issued_at: issued.issued_at,
          last_synced_at: previous?.last_synced_at ?? null, last_synced_count: previous?.last_synced_count ?? null }))
      } else {
        await revokeHealthSyncToken()
        if (!alive.current) return
        setToken(null)
        setStatus((previous) => previous ? { ...previous, enabled: false } : null)
      }
      setFailedAction(null)
    } catch (e) {
      if (alive.current) { setError(toMessage(e)); setFailedAction(action) }
    } finally { if (alive.current) setBusy(false) }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      if (alive.current) setCopyMessage(`${label}をコピーしました`)
    } catch {
      if (alive.current) setCopyMessage('コピーできませんでした。下の欄をタップして全選択し、長押しして手動でコピーしてください。')
    }
  }

  return <section className="rounded-2xl border border-border bg-surface" aria-label="ヘルスケア連携設定">
    <button type="button" className="flex min-h-14 w-full items-center justify-between gap-2 px-4 text-left font-semibold"
      aria-expanded={open} aria-controls="health-sync-panel" disabled={busy} onClick={() => setOpen((value) => !value)}>
      ヘルスケア連携<span aria-hidden="true">{open ? '−' : '＋'}</span>
    </button>
    {open && <div id="health-sync-panel" className="flex min-w-0 flex-col gap-3 border-t border-border p-4">
      <p className="text-sm text-muted">iPhoneショートカットから、指定した期間の体重・体脂肪率を取り込みます。</p>
      {loading ? <p className="text-sm" role="status">接続状態を確認中…</p> : status && <>
        <p className="text-sm font-semibold">{status.enabled ? '接続可能' : '未接続'}</p>
        {status.issued_at && <p className="text-xs text-muted">最終発行: <time dateTime={status.issued_at}>{new Date(status.issued_at).toLocaleString('ja-JP')}</time></p>}
        <p className="text-sm">{status.last_synced_at
          ? <>最終同期: <time dateTime={status.last_synced_at}>{new Date(status.last_synced_at).toLocaleString('ja-JP')}</time> / 書き込み {status.last_synced_count ?? 0}件</>
          : '同期はまだありません'}</p>
        <p className="text-xs text-muted">書き込み件数は追加・更新した日の合計です。既存のまま保持した日は含みません。</p>
        <Button disabled={busy} onClick={() => status.enabled ? setConfirmation('issue') : void perform('issue')}>
          {busy ? '操作中…' : status.enabled ? 'トークンを再発行' : 'トークンを発行'}
        </Button>
        {status.enabled && <Button variant="danger" disabled={busy} onClick={() => setConfirmation('revoke')}>連携を失効</Button>}
      </>}
      {error && <div className="flex flex-col gap-2">
        <p role="alert" className="text-sm text-accent">{error}</p>
        <Button variant="ghost" disabled={busy || loading} onClick={() => failedAction ? void perform(failedAction) : setAttempt((value) => value + 1)}>
          {failedAction ? '操作を再試行' : '接続状態を再試行'}
        </Button>
      </div>}
      {confirmation && <div role="alertdialog" aria-label={confirmation === 'issue' ? '再発行の確認' : '失効の確認'}
        className="flex flex-col gap-3 rounded-xl border border-accent p-3">
        <p className="text-sm">{confirmation === 'issue'
          ? '再発行すると以前のトークンはすぐに無効になります。ショートカットのトークンも新しい値に置き換えてください。'
          : '失効するとショートカットから同期できなくなります。取り込んだ記録は残ります。'}</p>
        <Button variant="danger" onClick={() => void perform(confirmation)}>{confirmation === 'issue' ? '再発行する' : '失効する'}</Button>
        <Button variant="ghost" onClick={() => setConfirmation(null)}>キャンセル</Button>
      </div>}
      <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">送信先URL
        <textarea readOnly rows={3} value={healthSyncEndpoint} onFocus={(event) => event.currentTarget.select()}
          className="min-h-14 w-full resize-none rounded-xl border border-border bg-bg p-3 text-fg" />
      </label>
      <Button variant="ghost" onClick={() => void copy(healthSyncEndpoint, '送信先URL')}>送信先URLをコピー</Button>
      {token && <>
        <p className="text-sm">新しいトークンはこの画面でだけ表示します。この画面を離れると再表示できません。ショートカットへコピーし、他の人に共有しないでください。</p>
        <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">新しい個人トークン
          <textarea readOnly rows={3} value={token} autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()}
            className="min-h-14 w-full resize-none rounded-xl border border-border bg-bg p-3 font-mono text-fg" />
        </label>
        <Button variant="ghost" onClick={() => void copy(token, 'トークン')}>トークンをコピー</Button>
      </>}
      {copyMessage && <p className="text-sm" role="status">{copyMessage}</p>}
      <details className="min-w-0">
        <summary className="flex min-h-14 cursor-pointer items-center text-sm font-semibold">iPhoneショートカットの設定手順</summary>
        <a href={guideUrl} download="health-sync-shortcut.md" className="flex min-h-14 items-center text-sm underline">手順を保存</a>
        <pre data-testid="health-sync-guide" className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-muted">{guide}</pre>
      </details>
    </div>}
  </section>
}
