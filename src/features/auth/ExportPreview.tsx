import { useState } from 'react'

// The Markdown export and the question to paste into an AI, as a sample.
export function ExportPreview() {
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
