import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

const REVEAL = 88

export function ExerciseSwipeRow({ children, label, disabled, onHide }: {
  children: ReactNode
  label: string
  disabled: boolean
  onHide: () => Promise<void> | void
}) {
  const row = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const moved = useRef(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  function hide() {
    if (disabled) return
    void Promise.resolve(onHide()).finally(() => setOffset(0))
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0) ||
      (event.target as Element).closest('[data-swipe-ignore]')) return
    start.current = { x: event.clientX, y: event.clientY, base: offset }
    moved.current = false
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const initial = start.current
    if (!initial) return
    const dx = event.clientX - initial.x
    const dy = event.clientY - initial.y
    if (!moved.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dy) > Math.abs(dx)) { start.current = null; return }
      moved.current = true
      setDragging(true)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    setOffset(Math.min(0, initial.base + dx))
  }

  function up() {
    start.current = null
    if (!moved.current) return
    setDragging(false)
    const width = row.current?.offsetWidth || 320
    if (offset < -width / 2) { setOffset(-width); hide() }
    else setOffset(offset < -REVEAL / 2 ? -REVEAL : 0)
  }

  function cancel() {
    start.current = null
    if (moved.current) {
      setDragging(false)
      setOffset((current) => current < -REVEAL / 2 ? -REVEAL : 0)
    }
  }

  return <div ref={row} className="relative overflow-hidden border-b border-border last:border-b-0">
    <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
      onClickCapture={(event) => {
        if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false }
        else if (offset !== 0) { event.stopPropagation(); setOffset(0) }
      }}
      className={`relative z-10 flex items-center bg-surface touch-pan-y ${dragging ? '' : 'transition-transform duration-200'}`}
      style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}>
      {children}
    </div>
    <button type="button" aria-label={`${label}を非表示にする`} disabled={disabled}
      onClick={hide} onFocus={() => setOffset(-REVEAL)} onBlur={() => setOffset(0)}
      className="absolute inset-y-0 right-0 z-0 flex min-w-22 items-center justify-center bg-accent text-sm font-semibold text-white disabled:opacity-60"
      style={{ width: Math.max(REVEAL, -offset) }}>非表示</button>
  </div>
}
