import { Link } from 'react-router-dom'
export function LandingPage() {
  return <main className="mx-auto max-w-lg px-6 pb-12">
    <header className="flex min-h-20 items-center justify-between"><span className="text-3xl font-bold tracking-tight">Glog</span><Link className="flex min-h-14 items-center text-sm text-muted" to="/login">ログイン</Link></header>
    <section className="py-8"><p className="text-xs tracking-[0.2em] text-muted">YOUR TRAINING, YOUR PROGRESS</p><h1 className="mt-5 text-4xl font-semibold leading-tight">今日の積み重ねを、<br />次の自己ベストへ。</h1><p className="mt-5 leading-relaxed text-muted">重量と回数を、迷わず記録。<br />自分の成長も、仲間との競争も、Glogで。</p>
      <img src="/glog-icon-512.png" alt="バーベルを持つアスリート" className="mx-auto my-6 h-52 w-52 rounded-3xl" />
      <Link to="/signup" className="flex min-h-14 items-center justify-center rounded-xl bg-accent font-semibold text-white">アカウントを作って始める</Link>
    </section>
    <section className="divide-y divide-border" aria-label="Glogでできること">{[['すぐに記録','ルーティンから開始。重量と回数を選んで、セットを残す。'],['成長が見える','カレンダーで振り返り、推定1RMで重量の伸びを確認。'],['仲間と続ける','招待制コミュニティで競い合う。全体ランキングへの参加は自分で選べます。']].map(([title,text])=><div key={title} className="py-6"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted">{text}</p></div>)}</section>
    <p className="mt-6 text-xs text-muted">スマートフォン・PCに対応。ホーム画面に追加して使えます。</p>
    <nav className="mt-6 flex gap-6 text-xs text-muted" aria-label="規約"><Link to="/terms" className="flex min-h-14 items-center">利用規約</Link><Link to="/privacy" className="flex min-h-14 items-center">プライバシーポリシー</Link></nav>
  </main>
}
