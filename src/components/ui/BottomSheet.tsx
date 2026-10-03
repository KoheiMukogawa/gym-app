import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'

type Props = {
  title: string
  description?: string
  children: ReactNode
  onDismiss: () => void
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
}

/** The native modal dialog traps focus and keeps the underlying page inert. */
export function BottomSheet({ title, description, children, onDismiss, dismissible = true, initialFocusRef }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const pointerStartedOutside = useRef(false)

  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    initialFocusRef?.current?.focus({ preventScroll: true })

    // iOS keeps the layout viewport behind the keyboard. Anchor the sheet to
    // the visible viewport, and leave its actions above the keyboard.
    const viewport = window.visualViewport
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight
      const inset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0))
      element.style.setProperty('--sheet-keyboard-inset', `${inset}px`)
      element.style.setProperty('--sheet-visible-height', `${Math.max(0, height - 16)}px`)
    }
    resize()
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize)
      element.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [initialFocusRef])

  function outside(x: number, y: number) {
    const box = dialog.current!.getBoundingClientRect()
    return x < box.left || x > box.right || y < box.top || y > box.bottom
  }

  return <dialog ref={dialog} className="bottom-sheet" aria-modal="true" aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); if (dismissible) onDismiss() }}
    onPointerDown={(event) => { pointerStartedOutside.current = event.target === event.currentTarget && outside(event.clientX, event.clientY) }}
    onClick={(event) => {
      if (dismissible && pointerStartedOutside.current && event.target === event.currentTarget && outside(event.clientX, event.clientY)) onDismiss()
    }}>
    <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
      <div>
        <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        {description && <p id={descriptionId} className="mt-1 text-sm text-muted tabular-nums">{description}</p>}
      </div>
      <button type="button" aria-label="入力を閉じる" disabled={!dismissible} onClick={onDismiss}
        className="flex min-h-14 min-w-14 items-center justify-center rounded-full text-muted active:bg-border disabled:opacity-40">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="m6 6 12 12M6 18 18 6" />
        </svg>
      </button>
    </header>
    {children}
  </dialog>
}
