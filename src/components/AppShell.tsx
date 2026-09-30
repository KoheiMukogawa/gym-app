import { Link, NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useSession } from '../features/auth/SessionProvider'
import { toMessage } from '../lib/errors'

const TABS = [
  { to: '/', label: '記録' },
  { to: '/history', label: '履歴' },
  { to: '/strength', label: 'Big3' },
]

export function AppShell() {
  const { signOut } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 pt-2">
        <Link to="/" aria-label="GYM LOG トップへ" className="flex min-h-14 items-center text-xs font-semibold tracking-[0.25em] text-muted">GYM LOG</Link>
        <details className="relative">
          <summary className="flex min-h-14 min-w-14 cursor-pointer list-none items-center justify-center text-xl text-muted" aria-label="アカウント">•••</summary>
          <div className="absolute right-0 z-50 w-60 rounded-xl border border-border bg-surface p-3 shadow-xl">
            {error && <p role="alert" className="p-2 text-sm text-accent">{error}</p>}
            <button className="min-h-14 w-full text-sm" disabled={busy} onClick={async () => {
              setBusy(true); setError(null)
              try { await signOut() } catch (e) { setError(toMessage(e)) }
              finally { setBusy(false) }
            }}>{busy ? 'ログアウト中…' : 'ログアウト'}</button>
          </div>
        </details>
      </header>
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex min-h-16 flex-1 items-center justify-center text-sm ${
                isActive ? 'text-accent font-semibold' : 'text-muted'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
