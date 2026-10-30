import { useRef } from 'react'
import { SwipeRow } from '../../components/SwipeRow'
import { totalLoad } from '../../lib/bodyweight'
import { setRm } from './setRm'
import type { ListRow } from './listRows'
import { kgToUnitText, unitToKg, type WeightUnit } from './weightUnit'

type Props = {
  exerciseName: string
  rows: ListRow[]
  onChange: (rows: ListRow[]) => void
  /** 1行目の「写す」ボタンが使う、前回の1セット目 */
  previousFirst: ListRow | null
  /** 行ごとの、保存できない理由 */
  errors: Record<string, string>
  /** 自重種目は「加重」を打ち、推定1RMは体重を足して出す */
  bodyweight: { value: number | null } | null
  /** 重さを打つ単位 */
  unit: WeightUnit
  disabled: boolean
}

function number(text: string): number {
  return Number(text.trim().replace(',', '.').replace('−', '-'))
}

/** 上の行（1行目は前回の1セット目）の値を写すボタン */
function CopyButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
    className="group flex h-9 w-7 shrink-0 items-center justify-center disabled:opacity-35">
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white group-active:opacity-70">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
      </svg>
    </span>
  </button>
}

function Field({ label, value, onChange, inputMode, placeholder, invalid, disabled, wide = false }: {
  label: string; value: string; onChange: (value: string) => void; inputMode: 'decimal' | 'numeric' | 'text'
  placeholder: string; invalid: boolean; disabled: boolean; wide?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return <span className="relative block min-w-0">
    <input ref={input} aria-label={label} value={value} disabled={disabled} inputMode={inputMode} placeholder={placeholder}
      aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)}
      // 打ち直しやすいよう、触ったら全体を選ぶ
      onFocus={(e) => { if (!wide) e.target.select() }}
      className={`h-9 w-full min-w-0 border-0 border-b bg-transparent px-1 text-fg placeholder:text-muted/60 focus:outline-none ${wide ? 'text-left' : 'pr-5 text-right font-semibold tabular-nums'} ${invalid ? 'border-accent' : 'border-muted/60 focus:border-accent'}`} />
    {/* 数字はバツで消せる */}
    {!wide && value !== '' && !disabled && <button type="button" aria-label={`${label}を消す`}
      onClick={() => { onChange(''); input.current?.focus() }}
      className="absolute inset-y-0 right-0 flex w-5 items-center justify-center">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted/50 text-bg">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="m7 7 10 10M17 7 7 17" /></svg>
      </span>
    </button>}
  </span>
}

/** 一覧入力：今の種目のセットを表の行として並べ、重量と回数をキーボードで打つ。保存は記録画面を抜けるとき。 */
export function ListSetTable({ exerciseName, rows, onChange, previousFirst, errors, bodyweight, unit, disabled }: Props) {
  const update = (id: string, patch: Partial<ListRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const weightLabel = bodyweight ? '加重' : '重さ'
  // 狭い画面（360px未満）では推定1RMをメモの行に回す
  const cols = 'grid-cols-[1.25rem_1.75rem_minmax(0,1.3fr)_1.25rem_1.75rem_minmax(0,1fr)_1rem] min-[360px]:grid-cols-[1.25rem_1.75rem_minmax(0,1.3fr)_1.25rem_1.75rem_minmax(0,1fr)_1rem_3.75rem]'

  return <section aria-label={`${exerciseName}のセット`} className="rounded-b-xl bg-surface pb-2">
    <div className={`grid ${cols} items-end gap-x-1 px-3 pt-2 text-xs text-muted`}>
      <span className="col-span-2">セット</span><span className="text-center">{weightLabel}</span><span /><span /><span className="text-center">回数</span><span />
      <span className="hidden text-right min-[360px]:block">RM</span>
    </div>
    <ul className="divide-y divide-border">
      {rows.map((row, i) => {
        const above = i === 0 ? previousFirst : rows[i - 1]
        const weight = unitToKg(number(row.weight), unit)
        const reps = number(row.reps)
        const filled = row.weight.trim() !== '' && row.reps.trim() !== '' && Number.isFinite(weight) && Number.isInteger(reps)
        const rm = filled ? setRm(bodyweight ? totalLoad(weight, bodyweight.value) : weight, reps) : null
        const rmText = rm ? `${kgToUnitText(rm.value, unit)}${unit}` : filled ? '—' : ''
        const error = errors[row.id]
        const n = i + 1
        return <SwipeRow key={row.id} label={`${exerciseName} ${n}セット目を削除`} disabled={disabled}
          onDelete={() => onChange(rows.filter((r) => r.id !== row.id))} compact>
          <div className="w-full px-3 pb-1">
            <div className={`grid ${cols} items-center gap-x-1`}>
              <span className="text-sm text-muted tabular-nums">{n}</span>
              <CopyButton label={`${n}セット目の${weightLabel}を${i === 0 ? '前回' : '上の行'}から写す`} disabled={disabled || !above?.weight}
                onClick={() => update(row.id, { weight: above?.weight ?? '' })} />
              <Field label={`${n}セット目の${weightLabel}`} value={row.weight} onChange={(value) => update(row.id, { weight: value })}
                inputMode={bodyweight ? 'text' : 'decimal'} placeholder={weightLabel} invalid={!!error} disabled={disabled} />
              <span className="text-xs text-muted">{unit}</span>
              <CopyButton label={`${n}セット目の回数を${i === 0 ? '前回' : '上の行'}から写す`} disabled={disabled || !above?.reps}
                onClick={() => update(row.id, { reps: above?.reps ?? '' })} />
              <Field label={`${n}セット目の回数`} value={row.reps} onChange={(value) => update(row.id, { reps: value })}
                inputMode="numeric" placeholder="回数" invalid={!!error} disabled={disabled} />
              <span className="text-xs text-muted">回</span>
              <span className="hidden text-right text-xs text-muted tabular-nums min-[360px]:block">{rmText}</span>
            </div>
            <div className={`grid ${cols} items-center gap-x-1`}>
              <span />
              <CopyButton label={`${n}セット目のメモを${i === 0 ? '前回' : '上の行'}から写す`} disabled={disabled || !above?.note}
                onClick={() => update(row.id, { note: above?.note ?? '' })} />
              <div className="col-span-3 min-[360px]:col-span-6">
                <Field label={`${n}セット目のメモ`} value={row.note} onChange={(note) => update(row.id, { note })}
                  inputMode="text" placeholder="メモ" invalid={false} disabled={disabled} wide />
              </div>
              <span className="col-span-2 text-right text-xs text-muted tabular-nums min-[360px]:hidden">{rmText}</span>
            </div>
            {error && <p role="alert" className="pb-1 pl-10 text-xs text-accent">{error}</p>}
          </div>
        </SwipeRow>
      })}
    </ul>
  </section>
}
