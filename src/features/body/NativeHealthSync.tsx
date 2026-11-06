import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { toMessage } from '../../lib/errors'
import { HEALTH_SYNCED_EVENT, healthPlugin, readHealthState, syncFromHealth, writeHealthState, type SyncResult } from './nativeHealth'

const SETTINGS_PATH = 'iPhoneの「設定」→「ヘルスケア」→「データアクセスとデバイス」→「BARBELL CLUB」'
const NO_DATA = `ヘルスケアに体重の記録が見つかりませんでした。読み取りを許可していない場合は、${SETTINGS_PATH}で許可してから「今すぐ読み込む」を押してください。`

function resultMessage({ found, inserted }: SyncResult): string {
  if (found === 0) return NO_DATA
  const kept = found - inserted
  if (inserted === 0) return '新しい記録はありませんでした。'
  return `${inserted}日分の記録を読み込みました。${kept > 0 ? `BARBELL CLUBに記録があった${kept}日はそのままです。` : ''}`
}

function healthMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  if (code === 'UNAVAILABLE') return 'この端末ではヘルスケアを使えません。'
  if (code === 'AUTHORIZATION_FAILED' || code === 'READ_FAILED') return 'ヘルスケアを読み取れませんでした。もう一度お試しください。'
  return toMessage(error)
}

const formatTime = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })

type Props = { userId: string; onBusyChange?: (busy: boolean) => void; onReload?: () => void }

/** iPhoneアプリ版の体組成画面の「ヘルスケア連携」。許可をたずね、全期間を読み込んで連携中にする。 */
export function NativeHealthSync({ userId, onBusyChange, onReload }: Props) {
  const [state, setState] = useState(() => readHealthState(userId))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)

  // アプリを開いたときの自動の読み込み（useHealthAutoSync）が終わったら、表示と記録を新しくする
  useEffect(() => {
    const synced = (event: Event) => {
      setState(readHealthState(userId))
      if ((event as CustomEvent<SyncResult>).detail?.inserted > 0) onReload?.()
    }
    window.addEventListener(HEALTH_SYNCED_EVENT, synced)
    return () => window.removeEventListener(HEALTH_SYNCED_EVENT, synced)
  }, [userId, onReload])

  async function run(action: () => Promise<string | null>) {
    if (lock.current) return
    lock.current = true; setBusy(true); onBusyChange?.(true); setError(null); setMessage(null)
    try {
      setMessage(await action())
    } catch (e) {
      // Xcodeのログ（Capacitorが console を転送する）で原因を追えるようにする
      console.warn('Glog health sync failed', (e as { code?: string } | null)?.code, (e as Error | null)?.message)
      setError(healthMessage(e))
    } finally {
      setState(readHealthState(userId))
      lock.current = false; setBusy(false); onBusyChange?.(false)
    }
  }

  const connect = () => run(async () => {
    const health = await healthPlugin()
    const { available } = await health.isAvailable()
    if (!available) throw Object.assign(new Error('unavailable'), { code: 'UNAVAILABLE' })
    await health.requestAuthorization()
    return resultMessage(await syncFromHealth(userId))
  })
  // 手で押したときは全期間を読む（あとから設定で許可した人の過去の記録も入るように）
  const syncNow = () => run(async () => resultMessage(await syncFromHealth(userId)))
  const disconnect = () => run(async () => {
    writeHealthState(userId, { enabled: false, lastSyncedAt: null })
    return `連携をやめました。読み込んだ記録は残ります。読み取りの許可は、${SETTINGS_PATH}で取り消せます。`
  })

  return <section className="space-y-3 border-t border-border py-4" aria-labelledby="native-health-heading">
    <div>
      <h2 id="native-health-heading" className="text-sm font-semibold">ヘルスケア連携</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{state.enabled
        ? `アプリを開いたときに、ヘルスケアの体重と体脂肪率を読み込みます。${state.lastSyncedAt ? `最後に読み込んだのは${formatTime(state.lastSyncedAt)}です。` : ''}`
        : 'iPhoneのヘルスケアから体重と体脂肪率を読み込みます。BARBELL CLUBに記録がある日はそのままです。'}</p>
    </div>
    {message && <p role="status" className="text-sm leading-relaxed">{message}</p>}
    {error && <p role="alert" className="text-sm leading-relaxed text-accent">{error}</p>}
    {state.enabled ? <div className="space-y-2">
      <Button variant="ghost" disabled={busy} onClick={() => void syncNow()}>{busy ? '読み込み中…' : '今すぐ読み込む'}</Button>
      <button type="button" disabled={busy} onClick={() => void disconnect()} className="min-h-14 w-full text-sm text-muted disabled:opacity-50">連携をやめる</button>
    </div> : <Button disabled={busy} onClick={() => void connect()}>{busy ? '読み込み中…' : 'ヘルスケアと連携する'}</Button>}
  </section>
}
