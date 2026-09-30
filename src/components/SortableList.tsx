import { useEffect, useRef, useState, type ReactNode } from 'react'

type Item = { id: string; label: string }
type Drag = { id: string; y: number; index: number; active: boolean; moved: boolean }
export function SortableList({ items, onReorder, disabled = false, renderItem, className = '' }: {
  items: Item[]; onReorder: (ids: string[]) => void; disabled?: boolean
  renderItem: (item: Item, handle: ReactNode) => ReactNode; className?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<number | null>(null)
  const [preview, setPreview] = useState<Drag | null>(null)
  const [message, setMessage] = useState('')
  function reset() {
    if (timer.current) clearTimeout(timer.current)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    timer.current = null; frame.current = null; drag.current = null; setPreview(null)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])
  useEffect(() => { if (disabled) reset() }, [disabled])
  function nearest(y: number) {
    const rows = root.current?.querySelectorAll<HTMLElement>('[data-sort-row]')
    let index = 0; let distance = Infinity
    rows?.forEach((row, i) => {
      const rect = row.getBoundingClientRect()
      const next = Math.abs(y - rect.top - rect.height / 2)
      if (next < distance) { distance = next; index = i }
    })
    return index
  }
  function track() {
    const state = drag.current
    if (!state?.active) return
    if (state.moved && state.y < 90) window.scrollBy(0, -8)
    else if (state.moved && state.y > window.innerHeight - 110) window.scrollBy(0, 8)
    state.index = nearest(state.y)
    setPreview({ ...state })
    frame.current = requestAnimationFrame(track)
  }
  function move(id: string, target: number) {
    const ids = items.map((item) => item.id)
    const from = ids.indexOf(id)
    if (from < 0 || target < 0 || target >= ids.length || target === from) return
    ids.splice(from, 1); ids.splice(target, 0, id)
    onReorder(ids)
    setMessage(`${items[from].label}を${target + 1}番目に移動しました`)
  }
  return <div ref={root} className={className}>
    <p role="status" className="sr-only">{message}</p>
    {items.map((item, index) => <div key={item.id} data-sort-row
      className={`relative ${preview?.id === item.id ? 'opacity-40' : ''} ${preview && preview.index === index && preview.id !== item.id ? 'ring-2 ring-inset ring-accent' : ''}`}>
      {renderItem(item, <button type="button" disabled={disabled || items.length < 2}
        aria-label={item.label + 'を長押しして並び替え'} aria-pressed={preview?.id === item.id}
        title="長押ししてドラッグ。キーボードでは上下キー。"
        className="flex min-h-14 min-w-14 touch-none select-none items-center justify-center text-xl text-muted disabled:opacity-25"
        // Override the app's unlayered touch-action: manipulation button rule.
        style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') reset()
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault(); move(item.id, index + (e.key === 'ArrowUp' ? -1 : 1))
          }
        }}
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0 || disabled) return
          reset()
          e.preventDefault()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = { id: item.id, y: e.clientY, index, active: false, moved: false }
          timer.current = setTimeout(() => {
            if (!drag.current) return
            drag.current.active = true
            setMessage(item.label + 'を移動中。離すと確定します')
            track()
          }, 300)
        }}
        onPointerMove={(e) => {
          const state = drag.current
          if (!state || state.id !== item.id) return
          if (!state.active && Math.abs(state.y - e.clientY) > 10) { reset(); return }
          if (state.active && Math.abs(state.y - e.clientY) > 2) state.moved = true
          state.y = e.clientY
          if (state.active) { state.index = nearest(e.clientY); setPreview({ ...state }) }
        }}
        onPointerUp={(e) => {
          const state = drag.current
          if (state?.active && state.id === item.id) move(item.id, nearest(e.clientY))
          reset()
        }}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
      ><span aria-hidden="true">⠿</span></button>)}
    </div>)}
    {preview && <div aria-hidden="true" className="pointer-events-none fixed z-50 rounded-xl border border-accent bg-surface px-4 py-4 text-sm shadow-xl"
      style={{ top: preview.y - 28, left: root.current?.getBoundingClientRect().left, width: root.current?.getBoundingClientRect().width }}>
      {items.find((item) => item.id === preview.id)?.label}
    </div>}
  </div>
}
