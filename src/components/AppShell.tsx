import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'ホーム' },
  { to: '/history', label: '履歴' },
  { to: '/members', label: 'メンバー' },
  { to: '/settings', label: '設定' },
]

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex min-h-14 flex-1 items-center justify-center text-sm ${
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
