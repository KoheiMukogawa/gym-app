import { useRef, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { toMessage } from '../../lib/errors'

type Props = {
  description: string
  note: string | null | undefined
  onSave: (note: string) => Promise<void>
  onDismiss: () => void
}

export function SetMemoSheet({ description, note, onSave, onDismiss }: Props) {
  const [draft, setDraft] = useState(note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const savingRef = useRef(false)

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

  return <BottomSheet title="セットのメモ" description={description} initialFocusRef={input} dismissible={!saving} onDismiss={dismiss}>
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-3">
        <textarea ref={input} aria-label="セットのメモ" maxLength={200} value={draft} disabled={saving}
          onChange={event => setDraft(event.target.value)} placeholder="例: フォーム意識、最後は補助あり"
          className="block min-h-14 w-full resize-none overflow-y-auto rounded-xl border border-border bg-bg p-3 text-base text-fg"
          style={{ height: 'clamp(3.5rem, calc(var(--sheet-visible-height, 100dvh) - 14rem), 12rem)' }} />
        <p className="mt-2 text-right text-xs text-muted tabular-nums">{draft.length} / 200文字</p>
        {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}
      </div>
      <div className="shrink-0 px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
      </div>
    </form>
  </BottomSheet>
}
