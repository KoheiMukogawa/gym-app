import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../../lib/analytics'
import { rememberFirstTouch } from '../../lib/attribution'
import { ExportPreview } from './ExportPreview'
import { LandingPhone, type PhoneTab } from './LandingPhone'
import './LandingPage.css'

const features: { number: string; title: string; text: string; tag: string; tab: PhoneTab; action: string }[] = [
  { number: '02', title: '見やすいから、振り返りたくなる。', text: 'BIG3も、いつもの種目も、伸びがわかるグラフに。カレンダーから日を選べば、その日のセットと推定1RMまで確認できます。', tag: '種目別グラフ・履歴', tab: 'big3', action: 'BIG3の画面を見る' },
  { number: '03', title: '自分たちのランキングを作ろう。', text: 'ジム仲間や友人を、招待コードで自分のコミュニティへ。BIG3合計・今月の伸び・DOTSで競い合えます。全体ランキングへの参加も選べます。', tag: '招待制コミュニティ・ランキング', tab: 'ranking', action: 'ランキングの画面を見る' },
]

const questions = [
  ['今使っているアプリの記録は移せますか？', '自動で取り込む機能はありません。BIG3のベストを入れれば、今日から推定1RMやランキングが使えます。残したい日の記録は、履歴の画面で日付を選んで入力できます。'],
  ['アプリのインストールは必要ですか？', 'ブラウザーからそのまま使えます。スマートフォンのホーム画面に追加すれば、アイコンからGlogを開けます。PCからも同じアカウントで使えます。'],
  ['BIG3以外の種目も記録できますか？', '部位から種目を選んで記録できます。リストにない種目は自分用に追加でき、いつものメニューはルーティンとして保存できます。'],
  ['ランキングに参加しなくても使えますか？', 'はい。記録やグラフは、参加せずに使えます。コミュニティ・全体・DOTSの参加を選べます。公開する情報は参加画面で確認でき、参加設定はあとから変更できます。'],
  ['AIにはどうやって相談しますか？', 'Glogで期間を選んでデータをエクスポートし、使っているAIに貼り付けます。「この記録をもとに次回のメニューを考えて」のように質問して相談できます。相談はGlogの外で行います。'],
]

export function LandingPage() {
  const [tab, setTab] = useState<PhoneTab>('home')
  const phone = useRef<HTMLElement>(null)
  function show(next: PhoneTab) {
    setTab(next)
    phone.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  }
  useEffect(() => {
    rememberFirstTouch('landing')
    track({ name: 'landing_view' })
  }, [])
  return <main className="landing-page">
    <header className="landing-header landing-container">
      <Link to="/" className="landing-brand" aria-label="Glog トップへ">Glog<span>筋トレ記録</span></Link>
      <nav aria-label="ページ案内" className="landing-header-links">
        <a href="#features" className="landing-feature-link">できること</a>
        <Link to="/login" className="landing-login">ログイン<span aria-hidden="true">↗</span></Link>
      </nav>
    </header>

    <section className="landing-hero landing-container" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <p className="landing-eyebrow"><span aria-hidden="true" />記録を、振り返りと次の一歩へ。</p>
        <h1 id="landing-title">その記録、<br /><span>もっと活かせる。</span></h1>
        <p className="landing-lead">今のアプリから乗り換えても、<br />BIG3のベストを入れるだけ。<br />今日から推定1RM・グラフ・ランキング。</p>
        <Link to="/signup" className="landing-cta">アカウントを作って始める<span aria-hidden="true">→</span></Link>
        <p className="landing-start-note">ほかのアプリからの乗り換えも、1分で<br />スマホ・PC対応 / ホーム画面から起動</p>
      </div>
      <figure ref={phone} className="landing-preview" aria-label="アプリの画面">
        <p className="landing-preview-hint">下のタブで、画面を切り替えられます</p>
        <LandingPhone tab={tab} onTab={setTab} />
        <figcaption>実際の画面です。記録は実際の利用者のもの（本人の許可済み）。<br />ランキングのほかの人・体組成・目標はサンプルです。</figcaption>
      </figure>
    </section>

    <section id="features" className="landing-ai landing-container" aria-labelledby="ai-title">
      <div className="landing-ai-copy">
        <span className="landing-feature-number" aria-hidden="true">01</span>
        <p className="landing-eyebrow">記録した先にある、3つの楽しみ</p>
        <h2 id="ai-title">記録を渡して、AIに相談。</h2>
        <p>期間内の全セットとメモを、Markdownでまとめて書き出し。使っているAIに貼り付けて、次のメニューや記録の傾向を相談できます。</p>
        <span className="landing-feature-tag">データのエクスポート</span>
      </div>
      <div className="landing-ai-demo" role="region" aria-label="エクスポートのサンプル">
        <div className="landing-demo-heading"><h3>データをエクスポート</h3><span>AIに相談</span></div>
        <ExportPreview />
      </div>
    </section>

    <section className="landing-features landing-container" aria-labelledby="features-title">
      <div className="landing-section-heading">
        <h2 id="features-title">振り返る。競い合う。</h2>
      </div>
      <div className="landing-feature-grid">
        {features.map(feature => <article key={feature.number} className="landing-feature">
          <span className="landing-feature-number" aria-hidden="true">{feature.number}</span>
          <h3>{feature.title}</h3><p>{feature.text}</p><span className="landing-feature-tag">{feature.tag}</span>
          <button type="button" className="landing-feature-show" onClick={() => show(feature.tab)}>{feature.action}<span aria-hidden="true">↑</span></button>
        </article>)}
      </div>
    </section>

    <section className="landing-beyond landing-container" aria-labelledby="beyond-title">
      <div className="landing-beyond-heading">
        <p className="landing-eyebrow">毎日の使いやすさも、大切に</p>
        <h2 id="beyond-title">記録は、気持ちよくシンプルに。</h2>
        <p>親指で入力しやすく、変化も見つけやすく。<br />毎日のトレーニングに寄り添う画面です。</p>
      </div>
      <div className="landing-beyond-grid">
        <article className="landing-beyond-card">
          <div className="landing-mini-body" aria-hidden="true"><span>体重<strong>72.4<small>kg</small></strong></span><span>体脂肪率<strong>16.2<small>%</small></strong></span></div>
          <h3>身体の変化も、ひとつの場所に。</h3>
          <p>体重と体脂肪率を同じグラフで確認。日々の測定とトレーニングを、まとめて振り返れます。</p>
          <button type="button" className="landing-feature-show" onClick={() => show('body')}>体組成の画面を見る<span aria-hidden="true">↑</span></button>
        </article>
        <article className="landing-beyond-card">
          <div className="landing-mini-body" aria-hidden="true"><span>重量<strong>80<small>kg</small></strong></span><span>回数<strong>8<small>回</small></strong></span></div>
          <h3>セットの合間に、さっと入力。</h3>
          <p>重量と回数はダイアルで選択。よく使う種目はルーティンに、フォームの気づきはセットのメモに残せます。</p>
        </article>
      </div>
      <p className="landing-sample-note">表示している数値はサンプルです。</p>
    </section>

    <section className="landing-start landing-container" aria-labelledby="start-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">今のアプリから、Glogへ</p><h2 id="start-title">乗り換えは、1分で。</h2></div>
      <ol className="landing-steps">
        {[
          ['アカウントを作る', '名前・メールアドレス・パスワードを登録。'],
          ['BIG3のベストを入れる', '重量×回数でOK。過去の履歴を全部移す必要はありません。'],
          ['今日から推定1RM・合計・ランキング', '続きはGlogで記録。伸びがグラフで見えます。'],
        ].map(([title, text], index) => <li key={title}><span className="landing-step-number">{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}
      </ol>
      <p className="landing-switch-note">今のアプリの記録を自動で取り込む機能はありません。記録はこれから、という方は最初のセットから始められます。</p>
    </section>

    <section className="landing-faq landing-container" aria-labelledby="faq-title">
      <h2 id="faq-title">始める前に、気になること。</h2>
      <div>{questions.map(([question, answer]) => <details key={question}>
        <summary><span>{question}</span><span className="landing-faq-plus" aria-hidden="true">+</span></summary><p>{answer}</p>
      </details>)}</div>
    </section>

    <section className="landing-finish landing-container" aria-labelledby="finish-title">
      <p className="landing-eyebrow">その1セットを、未来の自分へ</p>
      <h2 id="finish-title">今日の頑張りを、残そう。</h2>
      <Link to="/signup" className="landing-cta">Glogを始める<span aria-hidden="true">→</span></Link>
      <Link to="/login" className="landing-existing">アカウントをお持ちの方はこちら</Link>
    </section>

    <footer className="landing-footer landing-container">
      <span className="landing-footer-brand">Glog<span>あなたのトレーニングを、あなたの記録に。</span></span>
      <nav aria-label="計算ツール"><Link to="/calculators/1rm">1RM計算</Link><Link to="/calculators/dots">DOTS計算</Link></nav>
      <nav aria-label="規約"><Link to="/terms">利用規約</Link><Link to="/privacy">プライバシーポリシー</Link></nav>
    </footer>
  </main>
}
