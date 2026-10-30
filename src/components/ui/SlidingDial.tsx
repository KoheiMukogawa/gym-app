import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

/** A bottom dock section whose top edge follows a vertical drag on its handle. */
export function SlidingDial({ id, contentClassName, children }: { id: string, contentClassName?: string, children: ReactNode }) {
  const [visible, setVisible] = useState(true)
  const [height, setHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const expandedHeight = useRef(0)
  const drag = useRef<{ pointerId: number, startY: number, startHeight: number, fullHeight: number } | null>(null)
  const suppressClick = useRef(false)

  function toggle() {
    const currentHeight = panel.current?.getBoundingClientRect().height ?? 0
    const fullHeight = visible ? currentHeight : expandedHeight.current || content.current?.scrollHeight || 0
    if (visible) expandedHeight.current = fullHeight
    setHeight(currentHeight)
    requestAnimationFrame(() => {
      setVisible(!visible)
      setHeight(visible ? 0 : fullHeight)
    })
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const gesture = drag.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    const distance = event.clientY - gesture.startY
    if (Math.abs(distance) >= 8) {
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 400)
    }
    const show = cancelled || Math.abs(distance) < 40 ? visible : distance < 0
    setVisible(show)
    setHeight(show ? gesture.fullHeight : 0)
  }

  return <>
    <button type="button" data-button-key="toggle-dial" className="flex min-h-14 shrink-0 items-center justify-center" style={{ touchAction: 'none' }}
      aria-expanded={visible} aria-controls={id} aria-label={visible ? 'ダイヤルを隠す' : 'ダイヤルを表示'}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        const startHeight = panel.current?.getBoundingClientRect().height ?? 0
        const fullHeight = visible ? startHeight : expandedHeight.current || content.current?.scrollHeight || 0
        if (visible) expandedHeight.current = fullHeight
        drag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight, fullHeight }
        setHeight(startHeight)
        setDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const gesture = drag.current
        if (!gesture || gesture.pointerId !== event.pointerId) return
        setHeight(Math.max(0, Math.min(gesture.fullHeight, gesture.startHeight - (event.clientY - gesture.startY))))
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return }
        toggle()
      }}>
      <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border" />
    </button>
    <div ref={panel} id={id} aria-hidden={!visible} inert={!visible} onTransitionEnd={(event) => {
      if (event.target === event.currentTarget && event.propertyName === 'height' && visible && !drag.current) setHeight(null)
    }} className="flex min-h-0 flex-col overflow-hidden" style={{ height: height === null ? undefined : height, transition: dragging ? 'none' : 'height 180ms ease-out' }}>
      <div ref={content} className={contentClassName}>{children}</div>
    </div>
  </>
}
