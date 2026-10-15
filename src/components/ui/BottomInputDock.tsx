import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Keeps recording controls within thumb reach and reserves room for the set list.
 * Without navigation below it, the panel sits on the screen's bottom edge.
 */
export function BottomInputDock({ children, navigation = true }: { children: ReactNode, navigation?: boolean }) {
  const space = useRef<HTMLElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = panel.current!
    const reserve = () => { space.current!.style.height = `${Math.ceil(element.getBoundingClientRect().height) + 16}px` }
    const viewport = window.visualViewport
    let active = true
    let keyboardOpen = false
    const resize = () => {
      if (!active) return
      const height = viewport?.height ?? window.innerHeight
      const inset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0))
      const focused = document.activeElement
      const editing = (focused instanceof HTMLInputElement && !focused.readOnly && !focused.disabled &&
        ['text', 'number', 'search', 'email', 'password', 'tel', 'url'].includes(focused.type)) ||
        (focused instanceof HTMLTextAreaElement && !focused.readOnly && !focused.disabled) ||
        Boolean(focused?.closest('[contenteditable]:not([contenteditable="false"])'))
      // Browser chrome and scrolling also change visualViewport. Only a substantial
      // shrink while editing is a keyboard; retain its inset through the blur animation.
      keyboardOpen = inset > 120 && Math.abs((viewport?.scale ?? 1) - 1) < 0.01 && (editing || keyboardOpen)
      // Without a keyboard, the class decides: above the navigation, or on the bottom edge.
      element.style.bottom = keyboardOpen ? `${inset}px` : ''
      element.style.maxHeight = keyboardOpen ? `${Math.max(0, height - 16)}px` : '65dvh'
      reserve()
    }
    const afterBlur = () => queueMicrotask(resize)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reserve)
    observer?.observe(element)
    resize()
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize)
    document.addEventListener('focusin', resize)
    document.addEventListener('focusout', afterBlur)
    return () => {
      active = false
      observer?.disconnect()
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize)
      document.removeEventListener('focusin', resize)
      document.removeEventListener('focusout', afterBlur)
    }
  }, [])
  return <section ref={space} aria-label="セット入力" className="mt-auto">
    {/* touch-none: dragging the panel's own surface must not scroll the page behind it.
        Scroll containers inside (the wheels) reset touch-action and still scroll. */}
    <div ref={panel} className={`fixed inset-x-0 z-30 mx-auto flex max-h-[65dvh] max-w-2xl touch-none flex-col overflow-hidden rounded-t-3xl border border-border bg-bg shadow-[0_-8px_24px_rgba(0,0,0,0.18)] ${navigation ? 'bottom-[max(4.5rem,calc(3.5rem+env(safe-area-inset-bottom)))]' : 'bottom-0 border-b-0 pb-[env(safe-area-inset-bottom)]'}`}>
      {children}
    </div>
  </section>
}
