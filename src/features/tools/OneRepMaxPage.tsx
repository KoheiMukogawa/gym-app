import { useEffect, useRef, useState } from 'react'
import { track } from '../../lib/analytics'
import { prerenderedField } from '../../lib/prerendered'
import { estimateOneRepMax, MAX_E1RM_REPS } from '../../lib/strength'
import { percentageTable } from './oneRepMaxTable'
import { FaqSection, formatKg, NumberField, parseNumber, PublicLayout, SaveCta, UpdatedOn } from './PublicLayout'
import { ONE_RM_FAQ, publicPage } from './pages'

const page = publicPage('/calculators/1rm')!

export function OneRepMaxPage({ signedIn = false }: { signedIn?: boolean }) {
  const [weight, setWeight] = useState(() => prerenderedField('weight'))
  const [reps, setReps] = useState(() => prerenderedField('reps'))
  const [bodyweight, setBodyweight] = useState(() => prerenderedField('bodyweight'))
  const weightKg = parseNumber(weight)
  const repCount = parseNumber(reps)
  const tooManyReps = repCount !== null && repCount > MAX_E1RM_REPS
  const oneRepMax = weightKg !== null && repCount !== null ? estimateOneRepMax(weightKg, repCount) : null
  const bodyweightKg = parseNumber(bodyweight)
  const ratio = oneRepMax !== null && bodyweightKg !== null && bodyweightKg > 0 ? oneRepMax / bodyweightKg : null

  const tracked = useRef(false)
  useEffect(() => {
    if (oneRepMax === null || tracked.current) return
    tracked.current = true
    track({ name: 'calculator_used', calculator: '1rm' })
  }, [oneRepMax])

  return <PublicLayout page={page} source="calc-1rm">
    <section className="space-y-4" aria-labelledby="page-title">
      <h1 id="page-title" className="text-2xl font-bold leading-snug">1RM計算</h1>
      <p className="text-sm leading-relaxed text-muted">挙げた重量と回数から、1回だけ挙げられる最大重量（推定1RM）を計算します。ベンチプレス・スクワット・デッドリフトなど、どの種目にも使えます。</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="weight" label="重量" unit="kg" value={weight} onChange={setWeight} />
        <NumberField name="reps" label="回数" unit="回" value={reps} onChange={setReps} hint="1〜10回" />
      </div>
      <NumberField name="bodyweight" label="体重（任意）" unit="kg" value={bodyweight} onChange={setBodyweight} hint="入れると体重比も表示します" />
      <div aria-live="polite" className="space-y-4">
        {tooManyReps && <p role="alert" className="text-sm text-accent">11回以上は推定の誤差が大きいため計算しません。10回以下のセットで計算してください。</p>}
        {oneRepMax !== null && <>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs text-muted">推定1RM</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums">{formatKg(oneRepMax)}<span className="ml-1 text-base font-normal text-muted">kg</span></dd>
            </div>
            {ratio !== null && <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs text-muted">体重比</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums">{ratio.toFixed(2)}<span className="ml-1 text-base font-normal text-muted">倍</span></dd>
            </div>}
          </dl>
          <table className="w-full text-sm">
            <caption className="pb-2 text-left font-semibold">推定1RMに対する重量と回数の目安</caption>
            <thead><tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 text-left font-normal">割合</th>
              <th scope="col" className="py-2 text-right font-normal">重量</th>
              <th scope="col" className="py-2 text-right font-normal">回数の目安</th>
            </tr></thead>
            <tbody>{percentageTable(oneRepMax).map((row) => <tr key={row.percent} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 text-left font-normal tabular-nums">{row.percent}%</th>
              <td className="py-2 text-right tabular-nums">{formatKg(row.weightKg)} kg</td>
              <td className="py-2 text-right tabular-nums">{row.reps === null ? '10回超' : `${row.reps}回`}</td>
            </tr>)}</tbody>
          </table>
          <SaveCta signedIn={signedIn} source="calc-1rm">Glogに記録すると、セットごとの推定1RMが自動で計算され、種目別のグラフで伸びを確かめられます。</SaveCta>
        </>}
      </div>
    </section>

    <section aria-labelledby="method-title" className="space-y-3">
      <h2 id="method-title" className="text-lg font-semibold">計算方法</h2>
      <p className="text-sm leading-relaxed text-muted">Brzycki式を使っています。</p>
      <p className="rounded-xl border border-border bg-surface p-4 text-center font-semibold tabular-nums">1RM = 重量 × 36 ÷ (37 − 回数)</p>
      <p className="text-sm leading-relaxed text-muted">例: 80kgを8回挙げた場合、80 × 36 ÷ (37 − 8) = 約99.3kg。1回の記録はその重量をそのまま1RMとします。回数の目安は同じ式を回数について解いた値を切り捨てたものです。Glogアプリの推定1RM・グラフ・ランキングも同じ式で計算しています。</p>
      <p className="text-xs leading-relaxed text-muted">出典: Brzycki, M. (1993). Strength Testing—Predicting a One-Rep Max from Reps-to-Fatigue. <i>Journal of Physical Education, Recreation &amp; Dance</i>, 64(1), 88–90.</p>
    </section>

    <FaqSection items={ONE_RM_FAQ} />
    <UpdatedOn date={page.updated} />
  </PublicLayout>
}
