import { useState } from 'react'

const screens = [
  { id: 'progress', label: 'グラフ' }, { id: 'export', label: 'AI相談' }, { id: 'ranking', label: 'ランキング' },
] as const
type Screen = typeof screens[number]['id']

function TrendPreview() {
  return <div className="landing-demo-trend">
    <div className="landing-demo-metrics">
      <div><p>ベンチプレス</p><strong>100<small>kg</small></strong><span>最高推定1RM</span></div>
      <div><p>目標</p><strong>110<small>kg</small></strong><span>あと10kg</span></div>
    </div>
    <div className="landing-demo-period" aria-hidden="true"><span>1ヶ月</span><span className="selected">3ヶ月</span><span>1年</span><span>全期間</span></div>
    <svg viewBox="0 0 300 160" role="img" aria-label="ベンチプレスの推定1RMが伸びるサンプルグラフ">
      <defs><linearGradient id="landing-strength-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E8412F" stopOpacity=".25" /><stop offset="100%" stopColor="#E8412F" stopOpacity="0" /></linearGradient></defs>
      {[25, 65, 105, 145].map(y => <line key={y} x1="8" y1={y} x2="292" y2={y} stroke="#29292d" />)}
      <path d="M8 132 L55 117 L102 124 L150 80 L197 89 L244 54 L292 24 L292 150 L8 150Z" fill="url(#landing-strength-fill)" />
      <polyline points="8,132 55,117 102,124 150,80 197,89 244,54 292,24" stroke="#E8412F" strokeWidth="3" strokeLinejoin="round" fill="none" />
      <circle cx="292" cy="24" r="5" fill="#E8412F" stroke="#17171A" strokeWidth="3" />
    </svg>
    <div className="landing-demo-axis" aria-hidden="true"><span>7月</span><span>8月</span><span>9月</span></div>
    <div className="landing-demo-insight"><span className="landing-demo-dot" />グラフから、その日のセットまで。</div>
    <div className="landing-demo-history"><span>9/20 の記録</span><p><strong>75kg × 10回</strong><span>推定1RM 100kg</span></p></div>
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
      <div className="landing-demo-screen" role="region" aria-label={screen === 'export' ? 'エクスポートのサンプル' : screen === 'progress' ? '成長グラフのサンプル' : 'ランキングのサンプル'}>
        <div className="landing-demo-heading"><h2>{screen === 'export' ? 'データをエクスポート' : screen === 'progress' ? '筋力の伸び' : 'ランキング'}</h2><span>{screen === 'export' ? 'AIに相談' : screen === 'progress' ? 'あなたの記録' : '仲間と競う'}</span></div>
        {screen === 'progress' ? <TrendPreview /> : screen === 'export' ? <ExportPreview /> : <RankingPreview />}
      </div>
      <div className="landing-demo-nav" aria-hidden="true"><span>ホーム</span><span>履歴</span><span className={screen === 'progress' ? 'selected' : ''}>BIG3</span><span className={screen === 'ranking' ? 'selected' : ''}>ランキング</span><span>体組成</span></div>
    </div>
    <figcaption>画面イメージ・数値はサンプルです。</figcaption>
  </figure>
}
