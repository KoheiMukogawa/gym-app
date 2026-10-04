import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { useSession } from './SessionProvider'
import { useCaptcha } from './captcha'

const RESET_PASSWORD_PATH = '/reset-password'
const inputClass = 'mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg'

function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-8">
    <Link to="/" className="mb-8 text-4xl font-bold tracking-tight">Glog</Link>
    <h1 className="mb-6 text-xl font-semibold">{title}</h1>
    {children}
  </main>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const captcha = useCaptcha()
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setError(null); setSubmitting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + RESET_PASSWORD_PATH, captchaToken: captcha.token })
      if (error) throw error
      setSent(true)
    } catch (e) { setError(toMessage(e)) }
    finally { setSubmitting(false); captcha.reset() }
  }
  return <AuthScreen title="パスワードの再設定">
    {sent ? <div className="space-y-4">
      {/* Supabase answers the same way for unknown addresses, so this never reveals who has an account. */}
      <p role="status">{email} に再設定用のメールを送りました。メール内のリンクを開いて、新しいパスワードを設定してください。</p>
      <p className="text-sm text-muted">数分たっても届かない場合は、迷惑メールフォルダとメールアドレスを確認してください。</p>
      <Link to="/login" className="flex min-h-14 items-center text-accent">ログインへ</Link>
    </div> : <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <p className="text-sm text-muted">登録したメールアドレスに、新しいパスワードを設定するためのリンクを送ります。</p>
      <label className="block text-sm text-muted">メールアドレス
        <input type="email" autoComplete="email" required value={email} disabled={submitting}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </label>
      {captcha.widget}
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button type="submit" disabled={submitting || !captcha.ready}>{submitting ? '送信中…' : '再設定メールを送る'}</Button>
      <Link to="/login" className="flex min-h-14 items-center justify-center text-sm text-muted">ログインへ戻る</Link>
    </form>}
  </AuthScreen>
}

// The link in the email signs the user in for recovery; supabase-js reads it from the URL.
export function ResetPasswordPage() {
  const { userId, loading } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (loading) return <Spinner />
  if (!userId) return <AuthScreen title="パスワードの再設定">
    <div className="space-y-4">
      <p role="alert">このリンクは有効期限が切れているか、すでに使われています。もう一度再設定メールを送ってください。</p>
      <Link to="/forgot-password" className="flex min-h-14 items-center text-accent">再設定メールを送り直す</Link>
    </div>
  </AuthScreen>
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setError(null); setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      show('パスワードを変更しました')
      navigate('/', { replace: true })
    } catch (e) { setError(toMessage(e)); setSubmitting(false) }
  }
  return <AuthScreen title="新しいパスワード">
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="block text-sm text-muted">新しいパスワード
        <input type="password" minLength={8} autoComplete="new-password" required value={password} disabled={submitting}
          onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </label>
      <p className="text-xs text-muted">8文字以上。</p>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? '変更中…' : 'パスワードを変更'}</Button>
    </form>
  </AuthScreen>
}
