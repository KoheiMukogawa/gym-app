import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../../lib/analytics'
import { rememberFirstTouch } from '../../lib/attribution'
import { DEMO_EXERCISES } from '../../lib/demoMode'
import { LandingPhone, type PhoneScreen } from './LandingPhone'
import './LandingPage.css'

// 文章は、できることを普通の言葉で短く書く（本文は1文前後。長いと読み疲れる）。キャッチコピー風の言い回し（「〜を、〜へ。」など）は使わない。
// スマホは画面に固定し、スクロールで説明が変わるたびに、スマホの中もその画面に切り替える。
// 見せる順は、見て楽しい画面（BIG3・グラフ・ランキング）→ 入れ方（ダイヤル・一覧）→ エクスポート・体組成
// title の \n は、語の途中で折り返さないよう決めた改行の位置
type Chapter = { id: string; label: string; title: string; text: string; screen: PhoneScreen }
const chapters: Chapter[] = [
  { id: 'big3', label: 'BIG3', title: 'BIG3の合計と、目標までの残り。', screen: { chapter: 'big3', path: '/big3' },
    text: '推定1RMの合計を、目標と並べて見られます。' },
  { id: 'graph', label: 'グラフ', title: '種目ごとの伸びが、グラフでわかる。', screen: { chapter: 'graph', path: `/exercises/${DEMO_EXERCISES.bench}` },
    text: 'どんな種目でも。2本指で拡大でき、点を押せばその日の記録が出ます。' },
  { id: 'ranking', label: 'ランキング', title: 'ジム仲間だけのランキングを作れる。', screen: { chapter: 'ranking', path: '/ranking' },
    text: '招待コードを送るだけ。合計・伸び・DOTSで並べられます。' },
  { id: 'dial', label: 'ダイヤル入力', title: '直感的なダイヤル操作。', screen: { chapter: 'dial', path: '/log', mode: 'dial' },
    text: '重量を回すと、過去の記録から挙がる回数が自動で入ります。' },
  { id: 'list', label: '一覧入力', title: '既存の入力方法にも\n変更可能。', screen: { chapter: 'list', path: '/log', mode: 'list' },
    text: '表に数字を打ち込む入れ方も選べます。' },
  { id: 'export', label: 'エクスポート', title: '記録をAIに渡して、相談する。', screen: { chapter: 'export', path: '/export' },
    text: '期間を選んでテキストに。ChatGPTなどに貼って相談できます。' },
  { id: 'body', label: '体組成', title: '体重と体脂肪率も、同じアプリで。', screen: { chapter: 'body', path: '/body' },
    text: 'トレーニングと一緒に、体の変化も振り返れます。' },
]
const HOME: PhoneScreen = { path: '/', chapter: 'hero' }

const questions = [
  ['料金はかかりますか？', 'かかりません。広告もありません。'],
  ['アプリのインストールは必要ですか？', 'いりません。ブラウザーで開けばそのまま使えます。ホーム画面に追加すると、アプリと同じようにアイコンから開けます。PCからも同じアカウントで使えます。'],
  ['今使っているアプリの記録は移せますか？', '自動で取り込む機能はありません。登録したらBIG3のベスト（重量と回数）を入れてください。その日からグラフとランキングに反映されます。残したい日の記録は、履歴の画面で日付を選んで入力できます。'],
  ['BIG3以外の種目も記録できますか？', 'できます。部位ごとに種目を選べて、リストにない種目は自分で追加できます。'],
  ['ランキングに参加しないと使えませんか？', '参加しなくても、記録とグラフはすべて使えます。全体ランキングへの参加は、あとからいつでも切り替えられます。'],
]

export function LandingPage() {
  const [active, setActive] = useState<string>('hero')
  // 最初はスマホにアプリの起動画面を出し、少し待つかスクロールし始めたらホーム画面にする
  const [splash, setSplash] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setSplash(false), 2600)
    const onScroll = () => { if (window.scrollY > 24) setSplash(false) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.clearTimeout(timer); window.removeEventListener('scroll', onScroll) }
  }, [])
  const [progress, setProgress] = useState(0)
  // 紹介を読み終えて、よくある質問より下に来たか（進み具合のバーを隠す）
  const [pastTour, setPastTour] = useState(false)
  const sections = useRef(new Map<string, HTMLElement>())
  useEffect(() => {
    rememberFirstTouch('landing')
    track({ name: 'landing_view' })
  }, [])
  // 画面の決まった高さの線を越えた説明を「今の説明」にする。スマホ幅ではスマホが上に固定されるので、線を下に置く
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const narrow = window.matchMedia('(max-width: 767px)').matches
    const observer = new IntersectionObserver((entries) => {
      // ページの上のほうは、読み込み中に並びが動いても最初の画面のまま
      if (window.scrollY < window.innerHeight * 0.2) { setActive('hero'); return }
      for (const entry of entries) if (entry.isIntersecting) setActive((entry.target as HTMLElement).dataset.chapter!)
    }, { rootMargin: narrow ? '-78% 0px -21% 0px' : '-50% 0px -49% 0px' })
    sections.current.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])
  // 今の説明の中でどこまでスクロールしたか（0〜1）。説明は画面より高く、文章は止まったままスマホの中だけが動く
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const element = sections.current.get(active)
      if (!element) return
      const rect = element.getBoundingClientRect()
      const room = rect.height - window.innerHeight
      setProgress(room > 0 ? Math.min(1, Math.max(0, -rect.top / room)) : 0)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame) }
  }, [active])
  // 最初の画面ではスマホを大きく真ん中に出し、スクロールに合わせて定位置（PCは右、スマホ幅は上）へ縮めて移す。
  // 位置と大きさはCSS（--intro：1＝最初の画面、0＝定位置）で動かす
  const tour = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLElement>(null)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const element = tour.current, phone = stage.current
      if (!element || !phone) return
      // スクロールし始めてから画面の高さの4割で縮み終える（最初の説明に移る前に）
      const distance = window.innerHeight * 0.4
      const intro = 1 - Math.min(1, Math.max(0, window.scrollY / distance))
      element.style.setProperty('--intro', String(intro))
      // ページの上のほうは、いつも最初の画面（スマホ幅では説明を決める線が最初の画面より下にあるため）
      if (intro > 0.5) setActive('hero')
      setPastTour(element.getBoundingClientRect().bottom < window.innerHeight * 0.6)
      // 定位置から、ページの横の真ん中までの距離
      const box = element.getBoundingClientRect(), slot = phone.getBoundingClientRect()
      element.style.setProperty('--intro-x', `${box.left + box.width / 2 - (slot.left + slot.width / 2)}px`)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame) }
  }, [])
  const keep = (id: string) => (element: HTMLElement | null) => { if (element) sections.current.set(id, element); else sections.current.delete(id) }
  const screen = chapters.find((chapter) => chapter.id === active)?.screen ?? HOME
  const current = chapters.findIndex((chapter) => chapter.id === active)
  const smooth = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const
  function jump(id: string) {
    const element = sections.current.get(id)
    if (element) window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY + 1, behavior: smooth() })
  }

  return <main className="landing-page">
    <header className="landing-header landing-container">
      <Link to="/" className="landing-brand" aria-label="Glog トップへ">Glog</Link>
      <Link to="/signup" className="landing-signup">無料で始める</Link>
    </header>

    <div ref={tour} className="landing-tour landing-container">
      <figure ref={stage} className="landing-tour-phone" aria-label="アプリの画面（実際のアプリを見本のデータで動かしています）">
        <div className="landing-tour-stage"><LandingPhone screen={screen} progress={progress} showSplash={splash} splash={<>
          <img src="/glog-icon-512.png" alt="" width={112} height={112} className="landing-splash-icon" />
          <p className="landing-splash-name">Glog</p>
          <h1 id="landing-title">必要十分な機能を、<br />直感的な操作で。</h1>
        </>} /></div>
      </figure>
      <div className="landing-tour-text">
        {/* 最初の画面：大きく出したスマホを、ここをスクロールする間に定位置へ縮める */}
        <div ref={keep('hero')} data-chapter="hero" className="landing-hero" aria-hidden="true" />
        {chapters.map((chapter) => <section key={chapter.id} ref={keep(chapter.id)} data-chapter={chapter.id} data-active={active === chapter.id || undefined}
          className="landing-chapter" aria-labelledby={`chapter-${chapter.id}`}>
          <div className="landing-chapter-body">
            <p className="landing-chapter-label">{chapter.label}</p>
            <h2 id={`chapter-${chapter.id}`}>{chapter.title.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h2>
            <p className="landing-chapter-text">{chapter.text}</p>
          </div>
        </section>)}
      </div>
    </div>

    {/* 紹介があといくつあるか。画面の右端に説明ごとのドットを縦に並べ、今の説明は縦に伸びて読み進めると埋まる。
        押すとその説明へ */}
    <nav className="landing-dots" aria-label="紹介の進み具合" data-visible={(current >= 0 && !pastTour) || undefined}>
      <ol>
        {chapters.map((chapter, index) => <li key={chapter.id}>
          <button type="button" aria-label={`${chapter.label}へ移動（${index + 1} / ${chapters.length}）`} aria-current={index === current ? 'step' : undefined}
            data-done={index < current || undefined} onClick={() => jump(chapter.id)}>
            {index === current && <span className="landing-dots-label" aria-hidden="true">{chapter.label}<small>{index + 1} / {chapters.length}</small></span>}
            <span className="landing-dot">{index === current && <i style={{ transform: `scaleY(${Math.max(0.12, progress)})` }} />}</span>
          </button>
        </li>)}
      </ol>
    </nav>

    <section id="faq" className="landing-section landing-faq landing-container" aria-labelledby="faq-title">
      <h2 id="faq-title">よくある質問</h2>
      <div>{questions.map(([question, answer]) => <details key={question}>
        <summary><span>{question}</span><span className="landing-faq-plus" aria-hidden="true">+</span></summary><p>{answer}</p>
      </details>)}</div>
    </section>

    <section className="landing-finish landing-container" aria-labelledby="finish-title">
      <h2 id="finish-title">Glogを使ってみる</h2>
      <p>登録は、名前とメールアドレス、<br className="landing-narrow-break" />パスワードだけです。</p>
      <Link to="/signup" className="landing-cta">無料で始める</Link>
      <Link to="/login" className="landing-existing">アカウントをお持ちの方はログイン</Link>
    </section>

    <footer className="landing-footer landing-container">
      <div className="landing-footer-top">
        <span className="landing-footer-brand">Glog</span>
        <nav aria-label="ほかのページ">
          <Link to="/calculators/1rm">1RM計算</Link><Link to="/calculators/dots">DOTS計算</Link>
          <Link to="/terms">利用規約</Link><Link to="/privacy">プライバシーポリシー</Link>
        </nav>
      </div>
      <p className="landing-footer-note">紹介の画面に出ている記録は、利用者の許可を得て載せています（体組成・目標・ランキングの一部はサンプル）。</p>
    </footer>
  </main>
}
