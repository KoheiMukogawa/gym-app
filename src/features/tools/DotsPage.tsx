import { useEffect, useRef, useState } from 'react'
import { track } from '../../lib/analytics'
import { parseNumber } from '../../lib/numbers'
import { prerenderedField } from '../../lib/prerendered'
import { DOTS_LEVELS, dotsLevel, dotsScore, type DotsFormula } from '../../lib/dots'
import { FaqSection, NumberField, PublicLayout, SaveCta, UpdatedOn } from './PublicLayout'
import { DOTS_FAQ, publicPage } from './pages'

const page = publicPage('/calculators/dots')!

export function DotsPage({ signedIn = false }: { signedIn?: boolean }) {
  const [formula, setFormula] = useState<DotsFormula>(() => prerenderedField('dots-formula') === 'female' ? 'female' : 'male')
  const [bodyweight, setBodyweight] = useState(() => prerenderedField('bodyweight'))
  const [total, setTotal] = useState(() => prerenderedField('total'))
  const bodyweightKg = parseNumber(bodyweight)
  const totalKg = parseNumber(total)
  const score = bodyweightKg !== null && totalKg !== null ? dotsScore(totalKg, bodyweightKg, formula) : null
  const level = score === null ? null : dotsLevel(score)

  const tracked = useRef(false)
  useEffect(() => {
    if (score === null || tracked.current) return
    tracked.current = true
    track({ name: 'calculator_used', calculator: 'dots' })
  }, [score])

  return <PublicLayout page={page} source="calc-dots">
    <section className="space-y-4" aria-labelledby="page-title">
      <h1 id="page-title" className="text-2xl font-bold leading-snug">DOTS計算</h1>
      <p className="text-sm leading-relaxed text-muted">体重とBIG3（スクワット・ベンチプレス・デッドリフト）のトータルから、体重差を補正した筋力スコア「DOTS」を計算します。</p>
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">係数</legend>
        <div className="flex gap-2">{([['male', '男性用'], ['female', '女性用']] as const).map(([value, label]) =>
          <label key={value} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm">
            <input type="radio" name="dots-formula" value={value} checked={formula === value} onChange={() => setFormula(value)} className="h-5 w-5 accent-accent" />{label}
          </label>)}</div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="bodyweight" label="体重" unit="kg" value={bodyweight} onChange={setBodyweight} />
        <NumberField name="total" label="BIG3トータル" unit="kg" value={total} onChange={setTotal} />
      </div>
      <div aria-live="polite" className="space-y-4">
        {score !== null && level !== null && <>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs text-muted">DOTS</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums">{score.toFixed(1)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs text-muted">目安</dt>
              <dd className="mt-1 text-xl font-bold leading-9">{level[2]}</dd>
            </div>
          </dl>
          <SaveCta signedIn={signedIn} source="calc-dots">Glogに記録すると、推定1RMと体重からDOTSを自動で計算し、仲間とのランキングで比べられます。</SaveCta>
        </>}
      </div>
    </section>

    <section aria-labelledby="levels-title" className="space-y-3">
      <h2 id="levels-title" className="text-lg font-semibold">スコアの目安</h2>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-border text-xs text-muted"><th scope="col" className="pb-2 font-normal">DOTS（BIG3トータル）</th><th scope="col" className="pb-2 font-normal">目安</th></tr></thead>
        <tbody>{DOTS_LEVELS.map(([, range, name]) => <tr key={range} className="border-b border-border last:border-0"><th scope="row" className="py-2 pr-3 font-normal tabular-nums">{range}</th><td className="py-2">{name}</td></tr>)}</tbody>
      </table>
      <p className="text-xs leading-relaxed text-muted">DOTSに公式のレベル区分はありません。この表はGlog独自の目安で、統計に基づく順位（パーセンタイル）ではありません。</p>
    </section>

    <section aria-labelledby="method-title" className="space-y-3">
      <h2 id="method-title" className="text-lg font-semibold">計算方法</h2>
      <p className="rounded-xl border border-border bg-surface p-4 text-center font-semibold">DOTS = トータル × 500 ÷ (a + b·体重 + c·体重² + d·体重³ + e·体重⁴)</p>
      <p className="text-sm leading-relaxed text-muted">係数 a〜e は男性用・女性用で異なり、OpenPowerliftingの実装と同じ値を使っています。体重は男性用40〜210kg、女性用40〜150kgの範囲に収めて計算します。GlogのDOTSランキングも同じ式です。</p>
      <p className="text-xs leading-relaxed text-muted">参考: <a href="https://www.openpowerlifting.org/" className="underline" rel="noopener">OpenPowerlifting</a></p>
    </section>

    <FaqSection items={DOTS_FAQ} />
    <UpdatedOn date={page.updated} />
  </PublicLayout>
}
