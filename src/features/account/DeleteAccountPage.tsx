import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import { clearDraft } from '../workout-log/persistence'
import { CONFIRM_TEXT, accountMessage, deleteMyAccount, fetchDeletionSummary, type DeletionSummary } from './queries'

export function DeleteAccountPage() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()
  const [summary, setSummary] = useState<DeletionSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const load = useCallback(() => {
    setLoadError(null); setSummary(null)
    fetchDeletionSummary().then(setSummary).catch((e: unknown) => setLoadError(accountMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!userId || confirm !== CONFIRM_TEXT || lock.current) return
    lock.current = true; setDeleting(true); setError(null)
    try {
      await deleteMyAccount(confirm)
    } catch (e) {
      setError(accountMessage(e)); setDeleting(false); lock.current = false
      return
    }
    clearDraft(userId)
    // The account and its server sessions are gone, so only this device needs signing out.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    show('退会しました')
    navigate('/', { replace: true })
  }

  if (loadError) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{loadError}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!summary) return <Spinner />
  return <section className="space-y-5 p-4">
    <h1 className="text-2xl font-semibold">退会</h1>
    <p className="text-sm leading-relaxed">アカウントと次のデータがすべて削除され、元に戻せません。</p>
    <ul className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
      <li>記録 {summary.workout_days}日分（{summary.set_count}セット）</li>
      <li>体組成 {summary.body_log_count}件</li>
      <li>自作の種目 {summary.custom_exercise_count}件</li>
      <li>プロフィールとランキングへの参加</li>
    </ul>
    {/* Names may repeat, so the index is part of the key. */}
    {summary.owned_communities.map((community, index) => <p key={`${index}:${community.name}`} className="text-sm leading-relaxed text-accent">
      あなたが作成したコミュニティ「{community.name}」も削除され、ほかのメンバー{community.other_member_count}人の画面から消えます。
    </p>)}
    {summary.health_sync_connected && <p className="text-sm leading-relaxed">iPhoneのショートカットは自動では消えません。ショートカットAppから削除してください。</p>}
    <Link to="/export" className="flex min-h-14 items-center text-sm text-accent">退会前に記録を書き出す</Link>
    <form onSubmit={(event) => void submit(event)} className="space-y-4 border-t border-border pt-5">
      <label className="block text-sm text-muted">確認のため「退会する」と入力してください
        <input value={confirm} disabled={deleting} autoComplete="off" onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" />
      </label>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button type="submit" variant="danger" disabled={deleting || confirm !== CONFIRM_TEXT}>{deleting ? '退会処理中…' : '退会する'}</Button>
    </form>
  </section>
}
