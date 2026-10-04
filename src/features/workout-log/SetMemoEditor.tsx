import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { toMessage } from '../../lib/errors'

type Props = {
  description: string
  note: string | null | undefined
  onSave: (note: string) => Promise<void>
  onDismiss: () => void
}

export function SetMemoEditor({ description, note, onSave, onDismiss }: Props) {
  const [draft, setDraft] = useState(note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const savingRef = useRef(false)
  const form = useRef<HTMLFormElement>(null)

  useLayoutEffect(() => {
    const viewport = window.visualViewport
    let frame = 0
    const reveal = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const element = form.current
        if (!element?.getClientRects().length) return
        const box = element.getBoundingClientRect()
        const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - 12
        if (box.bottom > bottom) window.scrollBy({ top: box.bottom - bottom, behavior: 'instant' })
      })
    }
    input.current?.focus({ preventScroll: true })
    reveal()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal)
    if (form.current) observer?.observe(form.current)
    viewport?.addEventListener('resize', reveal)
    window.addEventListener('resize', reveal)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      viewport?.removeEventListener('resize', reveal)
      window.removeEventListener('resize', reveal)
    }
  }, [])

  async function save() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try { await onSave(draft); onDismiss() }
    catch (cause) { setError(toMessage(cause)) }
    finally { savingRef.current = false; setSaving(false) }
  }

  function dismiss() {
    if (savingRef.current) return
    if (draft !== (note ?? '') && !window.confirm('変更したメモを保存せずに閉じますか？')) return
    onDismiss()
  }

  return <form ref={form} aria-label="セットのメモ" className="w-full space-y-2 rounded-xl border border-border bg-bg p-3"
    onSubmit={event => { event.preventDefault(); void save() }}>
    <p className="text-xs text-muted">{description}</p>
    <textarea ref={input} aria-label="セットのメモ" rows={3} maxLength={200} value={draft} disabled={saving}
      onChange={event => setDraft(event.target.value)} placeholder="例: フォーム意識、最後は補助あり"
      className="block h-24 min-h-14 w-full resize-none overflow-y-auto rounded-lg border border-border bg-surface p-3 text-base text-fg focus:border-accent"
      style={{ outline: 'none' }} />
    <p className="mt-2 text-right text-xs text-muted tabular-nums">{draft.length} / 200文字</p>
    {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="ghost" aria-label="入力を閉じる" disabled={saving} onClick={dismiss}>キャンセル</Button>
      <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
    </div>
  </form>
}

/** Reserves scrollable space so an inline memo can stay above the iPhone keyboard. */
export function MemoInputSpace() {
  const space = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const viewport = window.visualViewport
    const resize = () => {
      const inset = Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))
      space.current!.style.height = `${inset > 120 && Math.abs((viewport?.scale ?? 1) - 1) < 0.01 ? inset : 0}px`
    }
    resize()
    viewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize) }
  }, [])
  return <div ref={space} aria-hidden="true" />
}
