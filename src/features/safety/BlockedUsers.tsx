import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { Avatar } from '../profile/Avatar'
import { listBlockedUsers, safetyMessage, unblockUser, type BlockedUser } from './queries'

/** プロフィールの「ブロックした人」。解除すると、その人がまたランキングに表示される。 */
export function BlockedUsers() {
  const [users, setUsers] = useState<BlockedUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)

  useEffect(() => {
    let active = true
    setLoadError(null); setUsers(null)
    listBlockedUsers().then((list) => { if (active) setUsers(list) }).catch((e: unknown) => { if (active) setLoadError(safetyMessage(e)) })
    return () => { active = false }
  }, [attempt])

  async function unblock(id: string) {
    if (lock.current) return
    lock.current = true; setBusy(id); setError(null)
    try {
      await unblockUser(id)
      setUsers((list) => list && list.filter((u) => u.user_id !== id))
    } catch (e) {
      setError(safetyMessage(e))
    } finally {
      lock.current = false; setBusy(null)
    }
  }

  return <section aria-labelledby="blocked-users-heading" className="space-y-2 rounded-2xl border border-border bg-surface p-4">
    <h2 id="blocked-users-heading" className="font-semibold">ブロックした人</h2>
    {loadError ? <div className="space-y-2">
      <p role="alert" className="text-sm text-muted">{loadError}</p>
      <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>再試行</Button>
    </div> : !users ? <Spinner /> : !users.length
      ? <p className="text-xs leading-relaxed text-muted">ブロックした人はいません。ランキングでメンバーを開くと、ブロックや通報ができます。</p>
      : <ul className="divide-y divide-border">{users.map((u) => <li key={u.user_id} className="flex min-h-16 items-center gap-3">
        <Avatar icon={u.icon} name={u.display_name} />
        <span className="min-w-0 flex-1 break-words text-sm">{u.display_name}</span>
        <button type="button" disabled={busy !== null} onClick={() => void unblock(u.user_id)} aria-label={`${u.display_name}のブロックを解除`}
          className="min-h-14 min-w-14 px-2 text-sm text-accent disabled:opacity-50">{busy === u.user_id ? '解除中…' : '解除'}</button>
      </li>)}</ul>}
    {error && <p role="alert" className="text-sm text-accent">{error}</p>}
  </section>
}
