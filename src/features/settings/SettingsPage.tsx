import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'

export function SettingsPage() {
  const { userId, profile, signOut, refreshProfile } = useSession()
  const { show } = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) setName(profile.display_name)
  }, [profile])

  async function handleSave() {
    const displayName = name.trim()
    if (!userId || displayName === '' || saving) return
    setSaving(true)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', userId)
      if (updateError) throw updateError
      await refreshProfile()
      setName(displayName)
      show('表示名を変更しました')
    } catch (e: unknown) {
      const message = toMessage(e)
      setError(message)
      show(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setError(null)
    try {
      await signOut()
    } catch (e: unknown) {
      const message = toMessage(e)
      setError(message)
      show(message)
      setSigningOut(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-lg font-semibold">設定</h1>

      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">表示名</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-14 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent"
          />
        </label>
        <Button onClick={() => void handleSave()} disabled={saving || name.trim() === ''}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </section>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <section>
        <Button variant="danger" onClick={() => void handleSignOut()} disabled={signingOut}>
          {signingOut ? 'ログアウト中…' : 'ログアウト'}
        </Button>
      </section>
    </div>
  )
}
