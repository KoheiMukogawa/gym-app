import { useEffect, useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { rememberFirstTouch } from '../../lib/attribution'
import { PUBLIC_PAGES, type Faq, type PublicPage } from './pages'

// Shared frame for public, indexable pages. It never imports Supabase so the same components
// can be rendered to static HTML at build time (src/prerender.tsx).
export function PublicLayout({ page, source, children }: { page: PublicPage; source: string; children: ReactNode }) {
  useEffect(() => {
    document.title = page.title
    rememberFirstTouch(source)
    return () => { document.title = 'Glog' }
  }, [page.title, source])

  return <div className="min-h-dvh">
    <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
      <Link to="/" className="flex min-h-14 items-center text-2xl font-bold tracking-tight">Glog</Link>
      <nav aria-label="サイト内" className="flex items-center gap-1 text-sm">
        <Link to="/calculators" className="flex min-h-14 items-center px-3 text-muted">計算ツール</Link>
        <Link to="/login" className="flex min-h-14 items-center px-3 text-muted">ログイン</Link>
      </nav>
    </header>
    <nav aria-label="パンくずリスト" className="mx-auto max-w-2xl px-4">
      <ol className="flex flex-wrap gap-1 text-xs text-muted">
        {page.breadcrumbs.map((crumb, index) => <li key={crumb.path} className="flex gap-1">
          {index > 0 && <span aria-hidden="true">/</span>}
          {index === page.breadcrumbs.length - 1
            ? <span aria-current="page">{crumb.name}</span>
            : <Link to={crumb.path} className="underline-offset-2 hover:underline">{crumb.name}</Link>}
        </li>)}
      </ol>
    </nav>
    <main className="mx-auto max-w-2xl space-y-10 px-4 pb-12 pt-4">{children}</main>
    <footer className="mx-auto max-w-2xl space-y-3 border-t border-border px-4 py-8 text-sm text-muted">
      <ul className="flex flex-wrap gap-x-4">
        {PUBLIC_PAGES.filter((p) => p.tool).map((p) => <li key={p.path}><Link to={p.path} className="flex min-h-14 items-center">{p.tool!.name}</Link></li>)}
        <li><Link to="/terms" className="flex min-h-14 items-center">利用規約</Link></li>
        <li><Link to="/privacy" className="flex min-h-14 items-center">プライバシーポリシー</Link></li>
      </ul>
      <p>Glog — 筋トレの記録を、次の成長へ。</p>
    </footer>
  </div>
}

export function UpdatedOn({ date }: { date: string }) {
  const [y, m, d] = date.split('-').map(Number)
  return <p className="text-xs text-muted">最終更新: <time dateTime={date}>{y}年{m}月{d}日</time></p>
}

export function FaqSection({ items }: { items: Faq }) {
  return <section aria-labelledby="faq-title" className="space-y-3">
    <h2 id="faq-title" className="text-lg font-semibold">よくある質問</h2>
    <dl className="space-y-4">
      {items.map(([question, answer]) => <div key={question} className="space-y-1">
        <dt className="font-semibold">{question}</dt>
        <dd className="text-sm leading-relaxed text-muted">{answer}</dd>
      </div>)}
    </dl>
  </section>
}

/** The path from a result to the app. Signed-in people go straight to logging. */
export function SaveCta({ signedIn, source, children }: { signedIn: boolean; source: string; children: ReactNode }) {
  return <aside className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <p className="text-sm leading-relaxed">{children}</p>
    {signedIn
      ? <Link to="/log" className="flex min-h-14 items-center justify-center rounded-xl bg-accent font-semibold text-white">記録する</Link>
      : <Link to={`/signup?from=${source}`} className="flex min-h-14 items-center justify-center rounded-xl bg-accent font-semibold text-white">無料でGlogに記録する</Link>}
  </aside>
}

export function NumberField({ name, label, unit, value, onChange, hint }: {
  name: string; label: string; unit: string; value: string; onChange: (value: string) => void; hint?: string
}) {
  const id = useId()
  return <div className="text-sm text-muted">
    <label htmlFor={id}>{label}</label>
    <span className="mt-1 flex min-h-14 items-center rounded-xl border border-border bg-surface pr-4 focus-within:border-accent">
      <input id={id} name={name} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="min-h-14 w-full min-w-0 bg-transparent px-4 text-fg tabular-nums"
        // The field border turns accent instead (focus-within); an outline here would be clipped.
        style={{ outline: 'none' }} />
      <span aria-hidden="true">{unit}</span>
    </span>
    {hint && <span id={`${id}-hint`} className="mt-1 block text-xs">{hint}</span>}
  </div>
}

/** Accepts full-width digits and a comma as the decimal mark. Empty or invalid → null. */
export function parseNumber(text: string): number | null {
  const normalized = text.normalize('NFKC').replace(/,/g, '.').trim()
  if (normalized === '') return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function formatKg(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')
}
