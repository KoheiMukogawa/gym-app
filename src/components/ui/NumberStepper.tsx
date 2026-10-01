import { useEffect, useRef, useState } from 'react'

type Props = {
  label: string
  value: number
  unit: string
  onStep: (direction: 1 | -1) => void
  onEnter: (value: number) => void
  direct?: boolean
}

export function NumberStepper({ label, value, unit, onStep, onEnter, direct = false }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { if (direct) setDraft(String(value)) }, [value, direct])
  const committedRef = useRef(false)

  function commit() {
    // Enter fires commit() via onKeyDown, then setEditing(false) unmounts the
    // focused input. Real browsers blur/focusout a focused element that gets
    // removed from the DOM, which would call commit() a second time. Guard
    // so at most one commit happens per edit session.
    if (committedRef.current) return
    committedRef.current = true
    const parsed = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(parsed)) {
      onEnter(parsed)
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        aria-label={`${label}を減らす`}
        onClick={() => onStep(-1)}
        className="h-14 w-14 shrink-0 rounded-full bg-surface border border-border text-2xl active:bg-border"
      >
        −
      </button>

      <div className="flex-1 text-center">
        <div className="text-xs text-muted">{label}</div>
        {direct ? (
          <input type="number" inputMode={unit === 'kg' ? 'decimal' : 'numeric'}
            aria-label={label} min={unit === 'kg' ? 0 : 1} max={unit === 'kg' ? 9999.9 : 9999} step={unit === 'kg' ? 0.1 : 1}
            value={draft} onFocus={(e) => e.target.select()} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const parsed = Number(draft)
              if (draft.trim() && Number.isFinite(parsed)) onEnter(parsed)
              else setDraft(String(value))
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="min-h-14 w-full min-w-0 rounded-lg bg-surface text-center text-4xl font-bold tabular-nums outline-none focus:ring-1 focus:ring-accent"
          />
        ) : editing ? (
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            aria-label={label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
            }}
            className="w-full bg-transparent text-center text-5xl font-bold tabular-nums outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`${label}を直接入力`}
            onClick={() => {
              setDraft(String(value))
              committedRef.current = false
              setEditing(true)
            }}
            className="text-5xl font-bold tabular-nums"
          >
            {value}
          </button>
        )}
        <div className="text-xs text-muted">{unit}</div>
      </div>

      <button
        type="button"
        aria-label={`${label}を増やす`}
        onClick={() => onStep(1)}
        className="h-14 w-14 shrink-0 rounded-full bg-surface border border-border text-2xl active:bg-border"
      >
        ＋
      </button>
    </div>
  )
}
