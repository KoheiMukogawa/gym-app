import { useState } from 'react'

type Props = {
  label: string
  value: number
  unit: string
  onStep: (direction: 1 | -1) => void
  onEnter: (value: number) => void
}

export function NumberStepper({ label, value, unit, onStep, onEnter }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function commit() {
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
        {editing ? (
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
