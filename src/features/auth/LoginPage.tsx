import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'
import { Button } from '../../components/ui/Button'
import { useSession } from './SessionProvider'

export function LoginPage() {
  const { userId, loading } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && userId) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(toMessage(signInError))
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6">
      <h1 className="mb-8 text-3xl font-bold">ジム記録</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">メールアドレス</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-14 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">パスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-14 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent"
          />
        </label>
        {error && <p role="alert" className="text-sm text-accent">{error}</p>}
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'ログイン中…' : 'ログイン'}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">
        アカウントは管理者が発行します
      </p>
    </div>
  )
}
