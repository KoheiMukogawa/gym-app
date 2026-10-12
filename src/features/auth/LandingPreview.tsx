import { useState } from 'react'
import { LiftCard } from '../strength/LiftCard'
import { StrengthScore } from '../strength/StrengthScore'
import { landingStrengthGoal, landingStrengthSnapshot } from './landingStrengthSample'

const screens = [
  { id: 'progress', label: 'グラフ' }, { id: 'export', label: 'AI相談' }, { id: 'ranking', label: 'ランキング' },
] as const
type Screen = typeof screens[number]['id']

// The real BIG3 screen parts, fed a member's actual record, scrolling inside the phone.
function Big3Preview() {
  return <div className="landing-demo-scroll" tabIndex={0} aria-label="BIG3画面（スクロールできます）">
    <div className="flex flex-col gap-4 pb-4">
      <h2 className="px-1 text-2xl font-bold">BIG3</h2>
      <StrengthScore snapshot={landingStrengthSnapshot} goal={landingStrengthGoal} />
      <section className="flex flex-col gap-3" aria-label="種目ごとの記録">
        <h3 className="text-sm font-semibold">種目ごとの記録</h3>
        {(['squat', 'bench', 'deadlift'] as const).map(key => <LiftCard key={key} lift={landingStrengthSnapshot.lifts[key]} />)}
      </section>
    </div>
  </div>
}

function ExportPreview() {
  const [expanded, setExpanded] = useState(false)
  return <div className="landing-demo-export">
    <p>期間を選んで、セットとメモをまとめて。</p>
    <div className="landing-demo-export-range"><span>開始日<strong>2026/9/1</strong></span><span>終了日<strong>2026/9/30</strong></span></div>
    <div className="landing-demo-markdown"><span>Markdown</span><pre>{'# Glog トレーニング記録\n\n## 9/20 ベンチプレス\n1set: 60kg × 10回\n2set: 75kg × 10回\nメモ: 胸を張る。最後まで丁寧に。'}</pre></div>
    <button type="button" className="landing-demo-save" aria-expanded={expanded} aria-controls="landing-ai-question" onClick={() => setExpanded(value => !value)}>{expanded ? '相談の例を閉じる' : 'AIへの相談例を見る'}</button>
    {expanded && <div id="landing-ai-question" className="landing-demo-question"><span>AIに貼り付けて、たとえば…</span><p>この記録をもとに、次回の重量と回数の目安を考えて。</p></div>}
    <p className="landing-demo-status">書き出した記録を、使っているAIへ。</p>
  </div>
}

function RankingPreview() {
  const [dots, setDots] = useState(false)
  return <div className="landing-demo-ranking">
    <div className="landing-demo-group-name"><span>招待制コミュニティ</span><strong>いつものジム仲間</strong></div>
    <div className="landing-demo-ranking-switch" role="group" aria-label="ランキングのサンプル指標">
      <button type="button" aria-pressed={!dots} onClick={() => setDots(false)}>BIG3合計</button><button type="button" aria-pressed={dots} onClick={() => setDots(true)}>DOTS</button>
    </div>
    <ol>{[
      { name: 'Aさん', total: 480, dots: 355.2 }, { name: 'あなた', total: 450, dots: 340.5 }, { name: 'Bさん', total: 425, dots: 321.8 },
    ].map((person, index) => <li key={person.name} className={index === 1 ? 'landing-demo-you' : ''}><span>{index + 1}</span><span className="landing-demo-rank-avatar" aria-hidden="true">{person.name.slice(0, 1)}</span><span>{person.name}</span><strong>{dots ? person.dots : person.total}{!dots && <small>kg</small>}</strong></li>)}</ol>
    <p className="landing-demo-insight"><span className="landing-demo-dot" />{dots ? '体重の違いを補正して、筋力を比較。' : '仲間を招待して、自分たちだけで競う。'}</p>
    <div className="landing-demo-invite">コミュニティを作る → 招待コードで仲間を招く</div>
  </div>
}

export function LandingPreview() {
  const [screen, setScreen] = useState<Screen>('progress')
  return <figure className="landing-preview">
    <div className="landing-preview-switch" role="group" aria-label="画面プレビュー切り替え">
      {screens.map(item => <button key={item.id} type="button" aria-pressed={screen === item.id} onClick={() => setScreen(item.id)}>{item.label}</button>)}
    </div>
    <div className="landing-phone">
      <div className="landing-phone-header" aria-hidden="true"><span>Glog</span><span className="landing-demo-avatar">G</span></div>
      <div className="landing-demo-screen" role="region" aria-label={screen === 'export' ? 'エクスポートのサンプル' : screen === 'progress' ? 'BIG3画面' : 'ランキングのサンプル'}>
        {screen === 'progress' ? <Big3Preview /> : <>
          <div className="landing-demo-heading"><h2>{screen === 'export' ? 'データをエクスポート' : 'ランキング'}</h2><span>{screen === 'export' ? 'AIに相談' : '仲間と競う'}</span></div>
          {screen === 'export' ? <ExportPreview /> : <RankingPreview />}
        </>}
      </div>
      <div className="landing-demo-nav" aria-hidden="true"><span>ホーム</span><span>履歴</span><span className={screen === 'progress' ? 'selected' : ''}>BIG3</span><span className={screen === 'ranking' ? 'selected' : ''}>ランキング</span><span>体組成</span></div>
    </div>
    <figcaption>{screen === 'progress' ? <>実際の画面・実際の利用者の記録です（本人の許可済み）。<br />画面の中をスクロールできます。目標はサンプルです。</> : '画面イメージ・数値はサンプルです。'}</figcaption>
  </figure>
}
