import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type Props = { label: string; ariaLabel?: string } & (
  | { to: string; onClick?: never; disabled?: never }
  | { to?: never; onClick: () => void; disabled?: boolean }
)

function isEditing(element: Element | null) {
  if (element instanceof HTMLInputElement) {
    return !element.readOnly && !element.disabled &&
      !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'hidden'].includes(element.type)
  }
  return element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ||
    Boolean(element?.closest('[contenteditable]:not([contenteditable="false"])'))
}

/** A thumb-reachable entry action above the navigation, hidden while entering data. */
export function FloatingRecordAction(props: Props) {
  const [editing, setEditing] = useState(() => isEditing(document.activeElement))
  useEffect(() => {
    let active = true
    const update = () => { if (active) setEditing(isEditing(document.activeElement)) }
    // focusout fires before the browser has assigned the next active element.
    const afterBlur = () => queueMicrotask(update)
    update()
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', afterBlur)
    return () => {
      active = false
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', afterBlur)
    }
  }, [])

  if (editing) return null
  const className = 'pointer-events-auto inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-5 text-base font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.28)] active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40'
  const content = <>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
    {props.label}
  </>
  return <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[calc(32rem-2rem)] justify-end">
    {props.to !== undefined
      ? <Link to={props.to} aria-label={props.ariaLabel} className={className}>{content}</Link>
      : <button type="button" onClick={props.onClick} disabled={props.disabled} aria-label={props.ariaLabel} className={className}>{content}</button>}
  </div>
}
