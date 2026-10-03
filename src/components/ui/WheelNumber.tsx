import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

const ROW_HEIGHT = 56

type Props = {
  label: string
  value: number
  unit: string
  onEnter: (value: number) => void
  min?: number
  format?: (value: number) => string
}

export function WheelNumber({ label, value, unit, onEnter, min, format }: Props) {
  const start = unit === 'kg' ? Math.ceil((min ?? 0) / 2.5) * 2.5 : 1
  const maximum = unit === 'kg' ? 9999.9 : 9999
  const regularValues = useMemo(() => unit === 'kg'
    ? Array.from({ length: Math.round((500 - start) / 2.5) + 1 }, (_, i) => start + i * 2.5)
    : Array.from({ length: 100 }, (_, i) => i + 1), [unit, start])
  // Retain exact custom values so scrolling away from one never shifts row positions.
  const [customValues, setCustomValues] = useState<number[]>(() => regularValues.includes(value) ? [] : [value])
  useEffect(() => {
    if (!regularValues.includes(value)) setCustomValues(previous => previous.includes(value) ? previous : [...previous, value])
  }, [value, regularValues])
  const values = useMemo(() => customValues.length === 0 && regularValues.includes(value) ? regularValues
    : [...new Set([...regularValues, ...customValues.filter(number => number >= (min ?? 0)), value])].sort((a, b) => a - b), [regularValues, customValues, value, min])
  const list = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedPosition = useRef(values.indexOf(value))
  const [index, setIndex] = useState(() => values.indexOf(value))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
    const next = values.indexOf(value)
    selectedPosition.current = next
    if (dragging.current) return
    setIndex(next)
    if (list.current) list.current.scrollTop = next * ROW_HEIGHT
  }, [value, values])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function select(next: number) {
    dragging.current = false
    if (timer.current) clearTimeout(timer.current)
    onEnter(values[next])
  }

  function beginEditing() {
    dragging.current = false
    if (timer.current) clearTimeout(timer.current)
    setEditing(true)
  }

  function settleScroll() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      dragging.current = false
      setIndex(selectedPosition.current)
      if (list.current) list.current.scrollTop = selectedPosition.current * ROW_HEIGHT
    }, 180)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      beginEditing()
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    select(Math.max(0, Math.min(values.length - 1, index + (event.key === 'ArrowUp' ? 1 : -1))))
  }

  const first = Math.max(0, index - 4)
  return <div>
    <p className="mb-1 text-center text-xs text-muted">{label}</p>
    <div className="relative" role={editing ? undefined : 'spinbutton'} tabIndex={editing ? undefined : 0}
      aria-label={editing ? undefined : label} aria-valuenow={editing ? undefined : value}
      aria-valuemin={editing ? undefined : min ?? (unit === 'kg' ? 0 : 1)}
      aria-valuemax={editing ? undefined : maximum} aria-valuetext={editing ? undefined : format ? format(value) : `${value} ${unit}`}
      onKeyDown={onKeyDown}>
      <div className="pointer-events-none absolute inset-x-0 top-14 h-14 rounded-xl border-y border-border bg-surface" />
      <div ref={list} aria-label={`${label}をスクロールで選択`}
        className="relative h-[168px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerDown={() => { dragging.current = true; if (timer.current) clearTimeout(timer.current) }}
        onPointerUp={settleScroll} onPointerCancel={settleScroll}
        onWheel={() => { dragging.current = true; settleScroll() }}
        onScroll={(event) => {
          if (!dragging.current) return
          const next = Math.max(0, Math.min(values.length - 1, Math.round(event.currentTarget.scrollTop / ROW_HEIGHT)))
          setIndex(next)
          onEnter(values[next])
          settleScroll()
        }}>
        <div style={{ height: (values.length + 2) * ROW_HEIGHT, position: 'relative' }}>
          {values.slice(first, Math.min(values.length, index + 5)).map((number, offset) => {
            const position = first + offset
            if (editing && position === index) return null
            return <button key={number} type="button" tabIndex={-1}
              aria-label={position === index ? `${label}を直接入力` : undefined}
              style={{ position: 'absolute', top: (position + 1) * ROW_HEIGHT, height: ROW_HEIGHT, width: '100%' }}
              className={`text-center tabular-nums ${position === index ? 'text-2xl font-semibold text-fg' : 'text-lg text-muted'}`}
              onClick={() => { if (position === index) beginEditing(); else select(position) }}>
              {format ? format(number) : <>{number}<span className="ml-1 text-xs font-normal">{unit}</span></>}
            </button>
          })}
        </div>
      </div>
      {editing && <input autoFocus type="number" aria-label={label} inputMode={unit === 'kg' ? 'decimal' : 'numeric'}
        min={min ?? (unit === 'kg' ? 0 : 1)} max={maximum} step={unit === 'kg' ? 0.1 : 1} value={draft}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          const number = Number(text)
          if (text.trim() && Number.isFinite(number)) onEnter(number)
        }}
        onBlur={() => { setDraft(String(value)); setEditing(false) }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur() }}
        className="absolute inset-x-0 top-14 h-14 w-full rounded-xl bg-surface text-center text-2xl font-semibold tabular-nums text-fg" />}
    </div>
  </div>
}
