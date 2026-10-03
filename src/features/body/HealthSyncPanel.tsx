import { useEffect, useRef, useState, type ReactNode } from 'react'
import guide from '../../../docs/health-sync-shortcut.md?raw'
import guideUrl from '../../../docs/health-sync-shortcut.md?url'
import { Button } from '../../components/ui/Button'
import { toMessage } from '../../lib/errors'
import { fetchHealthSyncStatus, healthSyncEndpoint, issueHealthSyncToken, revokeHealthSyncToken, type HealthSyncStatus } from './healthSyncQueries'
import { healthSyncShortcut } from './healthSyncShortcut'

type Props = { userId: string | null; refreshVersion: number; onBusyChange?: (busy: boolean) => void; onReload?: () => void }
type Action = 'issue' | 'revoke'

/** A keyed owner boundary also discards in-flight credentials on logout/user changes. */
export function HealthSyncPanel({ userId, refreshVersion, onBusyChange, onReload }: Props) {
  return userId ? <OwnedHealthSyncPanel key={userId} refreshVersion={refreshVersion} onBusyChange={onBusyChange} onReload={onReload} /> : null
}

function OwnedHealthSyncPanel({ refreshVersion, onBusyChange, onReload }: Omit<Props, 'userId'>) {
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
  const [guideOpen, setGuideOpen] = useState(false)
  const alive = useRef(true)
  const guideDetails = useRef<HTMLDetailsElement>(null)

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

  const syncedWithCurrentKey = !!(status?.enabled && status.last_synced_at
    && (!status.issued_at || Date.parse(status.last_synced_at) >= Date.parse(status.issued_at)))
  const locked = busy || loading
  // Shared links carry no credentials. Only enable installation after an iPhone check.
  const shortcutUrl = healthSyncShortcut?.verifiedOn
    && /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i.test(healthSyncShortcut.importUrl)
    ? healthSyncShortcut.importUrl : null

  function showGuide() {
    setGuideOpen(true)
    requestAnimationFrame(() => guideDetails.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  return <section className="border-t border-border" aria-label="ヘルスケア連携設定">
    <button type="button" className="flex min-h-14 w-full items-center justify-between gap-2 text-left text-sm font-medium text-muted"
      aria-expanded={open} aria-controls="health-sync-panel" disabled={busy} onClick={() => setOpen((value) => !value)}>
      ヘルスケア連携<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <div id="health-sync-panel" className="flex min-w-0 flex-col gap-4 pb-4 pt-2">
      <p className="text-sm text-muted">iPhoneの体重・体脂肪率を、ショートカット経由でGlogへ取り込みます。</p>
      {loading ? <p className="text-sm" role="status">接続状態を確認中…</p> : status &&
        <p className="text-sm font-semibold" role="status">{status.enabled ? syncedWithCurrentKey ? '連携中' : '初回同期待ち' : '未接続'}</p>}
      {error && <div className="flex flex-col gap-2">
        <p role="alert" className="text-sm text-accent">{error}</p>
        <Button variant="ghost" disabled={locked} onClick={() => failedAction ? void perform(failedAction) : setAttempt((value) => value + 1)}>
          {failedAction ? '操作を再試行' : '接続状態を再試行'}
        </Button>
      </div>}
      {confirmation && <div role="alertdialog" aria-label={confirmation === 'issue' ? '再発行の確認' : '失効の確認'}
        className="flex flex-col gap-3 rounded-xl border border-accent p-3">
        <p className="text-sm">{confirmation === 'issue'
          ? '再発行すると以前の連携キーはすぐに無効になります。ショートカットのキーも新しい値に置き換えてください。'
          : '失効するとショートカットから同期できなくなります。取り込んだ記録は残ります。'}</p>
        <Button variant="danger" disabled={locked} onClick={() => void perform(confirmation)}>{confirmation === 'issue' ? '再発行する' : '失効する'}</Button>
        <Button variant="ghost" disabled={locked} onClick={() => setConfirmation(null)}>キャンセル</Button>
      </div>}
      <ol className="flex min-w-0 flex-col gap-3" aria-label="連携の設定手順">
        <SetupStep number={1} title="連携キーを用意" done={!!status?.enabled}>
          <p className="text-sm text-muted">自分の記録に送るためのキーです。ショートカットのキー欄に貼り付けます。</p>
          {status && !token && <Button variant={status.enabled ? 'ghost' : 'primary'} disabled={locked}
            onClick={() => status.enabled ? setConfirmation('issue') : void perform('issue')}>
            {busy ? '操作中…' : status.enabled ? '連携キーを再発行' : '連携キーを発行'}
          </Button>}
          {status?.enabled && !token && <p className="text-xs text-muted">設定済みの方は再発行せず、次へ進めます。キーを保存していない場合は再発行してください。</p>}
          {token && <>
            <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">新しい連携キー
              <textarea readOnly rows={2} value={token} autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()}
                className="min-h-14 w-full resize-none rounded-xl border border-border bg-bg p-3 font-mono text-base text-fg" />
            </label>
            <Button disabled={locked} onClick={() => void copy(token, '連携キー')}>連携キーをコピー</Button>
            <p className="text-xs text-muted">この画面を離れると再表示できません。キーは共有せず、自分のショートカットだけに貼り付けてください。</p>
          </>}
          {copyMessage && <p className="text-sm" role="status">{copyMessage}</p>}
        </SetupStep>
        <SetupStep number={2} title="ショートカットを設定">
          {shortcutUrl ? <>
            <p className="text-sm text-muted">ショートカットを追加し、設定で連携キーを貼り付けてください。送信先は設定済みです。</p>
            <a href={shortcutUrl} target="_blank" rel="noopener noreferrer"
              className="flex min-h-14 items-center justify-center rounded-xl bg-accent px-4 text-center font-semibold text-white">同期ショートカットを追加</a>
          </> : <>
            <p className="text-sm text-muted">簡単追加は準備中です。現在は、下の手順でショートカットを作成できます。</p>
            <Button variant="ghost" onClick={showGuide}>手動設定の手順を見る</Button>
          </>}
          <a href="shortcuts://" className="flex min-h-14 items-center justify-center rounded-xl border border-border px-4 text-center text-sm font-semibold">iPhoneでショートカットを開く</a>
        </SetupStep>
        <SetupStep number={3} title="1日分で同期を確認" done={syncedWithCurrentKey}>
          <p className="text-sm text-muted">ショートカットを実行し、体重・体脂肪率の読み取りを許可してください。まずは記録がある1日分を同期します。</p>
          <Button variant="ghost" disabled={locked || !status?.enabled} onClick={() => onReload ? onReload() : setAttempt((value) => value + 1)}>同期結果を確認</Button>
          {status && <p className="text-sm">{status.last_synced_at
            ? <>最終同期: <time dateTime={status.last_synced_at}>{new Date(status.last_synced_at).toLocaleString('ja-JP')}</time> / 書き込み {status.last_synced_count ?? 0}件</>
            : '同期はまだありません'}</p>}
          {status?.last_synced_at && <p className="text-xs text-muted">書き込み件数は追加・更新した日数です。既存の記録を保持した日は含みません。</p>}
          <p className="text-xs text-muted">同期を確認できたら、過去の期間や毎日の自動実行を設定できます。</p>
        </SetupStep>
      </ol>
      <details ref={guideDetails} open={guideOpen} onToggle={(event) => setGuideOpen(event.currentTarget.open)} className="min-w-0 scroll-mt-4">
        <summary className="flex min-h-14 cursor-pointer items-center text-sm font-semibold">iPhoneショートカットの設定手順</summary>
        <div className="flex flex-col gap-3 pb-3">
          <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">送信先URL
            <textarea readOnly rows={3} value={healthSyncEndpoint} onFocus={(event) => event.currentTarget.select()}
              className="min-h-14 w-full resize-none rounded-xl border border-border bg-bg p-3 text-base text-fg" />
          </label>
          <Button variant="ghost" onClick={() => void copy(healthSyncEndpoint, '送信先URL')}>送信先URLをコピー</Button>
          <a href={guideUrl} download="health-sync-shortcut.md" className="flex min-h-14 items-center text-sm underline">手順を保存</a>
          <pre data-testid="health-sync-guide" className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-muted">{guide}</pre>
        </div>
      </details>
      {status?.enabled && <details className="min-w-0">
        <summary className="flex min-h-14 cursor-pointer items-center text-sm font-semibold">連携キーの管理</summary>
        <div className="flex flex-col gap-3 pb-3">
          {status.issued_at && <p className="text-xs text-muted">最終発行: <time dateTime={status.issued_at}>{new Date(status.issued_at).toLocaleString('ja-JP')}</time></p>}
          {token && <Button variant="ghost" disabled={locked} onClick={() => setConfirmation('issue')}>連携キーを再発行</Button>}
          <Button variant="danger" disabled={locked} onClick={() => setConfirmation('revoke')}>連携を失効</Button>
        </div>
      </details>}
    </div>}
  </section>
}

function SetupStep({ number, title, done = false, children }: { number: number; title: string; done?: boolean; children: ReactNode }) {
  return <li className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
    <h3 className="flex items-center gap-2.5 text-sm font-semibold">
      <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? 'bg-accent/15 text-accent' : 'bg-border text-muted'}`}>
        {done ? '✓' : number}
      </span>
      <span>{title}</span>{done && <span className="ml-auto text-xs font-normal text-muted">確認済み</span>}
    </h3>
    {children}
  </li>
}
