import { Link } from 'react-router-dom'
import { PublicLayout, UpdatedOn } from './PublicLayout'
import { PUBLIC_PAGES, publicPage } from './pages'

const page = publicPage('/calculators')!

export function CalculatorsPage() {
  return <PublicLayout page={page} source="calculators">
    <section className="space-y-4" aria-labelledby="page-title">
      <h1 id="page-title" className="text-2xl font-bold leading-snug">筋トレ計算ツール</h1>
      <p className="text-sm leading-relaxed text-muted">登録なしで使える無料の計算ツールです。計算式はGlogアプリの記録・ランキングと同じです。</p>
      <ul className="space-y-3">
        {PUBLIC_PAGES.filter((p) => p.tool).map((p) => <li key={p.path}>
          <Link to={p.path} className="block rounded-xl border border-border bg-surface p-4">
            <span className="block font-semibold">{p.tool!.name}</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">{p.description}</span>
          </Link>
        </li>)}
      </ul>
    </section>
    <UpdatedOn date={page.updated} />
  </PublicLayout>
}
