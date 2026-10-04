import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'
import { Button } from '../../components/ui/Button'
import { useSession } from './SessionProvider'
import { AvatarPicker } from '../profile/Avatar'
export function LoginPage({ signup = false }: { signup?: boolean }) {
  const { userId, loading } = useSession()
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[icon,setIcon]=useState('initials'),[publicRank,setPublicRank]=useState(false)
  const [error,setError]=useState<string|null>(null),[submitting,setSubmitting]=useState(false),[sent,setSent]=useState(false)
  if(!loading&&userId)return <Navigate to="/" replace/>
  async function submit(e:FormEvent){e.preventDefault();if(submitting)return;setError(null);setSubmitting(true)
    try{const result=signup?await supabase.auth.signUp({email,password,options:{data:{display_name:name.trim(),profile_icon:icon,global_ranking:publicRank},emailRedirectTo:window.location.origin+'/'}}):await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(signup&&!result.data.session)setSent(true)}catch(e){const code=(e as {code?:string})?.code;setError(code==='signup_disabled'?'現在、新規登録の受付は準備中です。しばらくしてからお試しください。':toMessage(e))}finally{setSubmitting(false)}}
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-8"><Link to="/" className="mb-8 text-4xl font-bold tracking-tight">Glog</Link><h1 className="mb-6 text-xl font-semibold">{signup?'プロフィールを作って始める':'ログイン'}</h1>
    {sent?<div className="space-y-4"><p role="status">確認メールを送信しました。メール内のリンクを開いて登録を完了してください。</p><Link to="/login" className="flex min-h-14 items-center text-accent">ログインへ</Link></div>:<form onSubmit={submit} className="space-y-4">
      {signup&&<><label className="block text-sm text-muted">名前<input required maxLength={30} value={name} onChange={e=>setName(e.target.value)} className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" disabled={submitting}/></label><AvatarPicker value={icon} name={name} onChange={setIcon} disabled={submitting}/></>}
      <label className="block text-sm text-muted">メールアドレス<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" disabled={submitting}/></label>
      <label className="block text-sm text-muted">パスワード<input type="password" minLength={signup?8:undefined} autoComplete={signup?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" disabled={submitting}/></label>
      {signup&&<p className="text-xs text-muted">8文字以上。</p>}
      {!signup&&<Link to="/forgot-password" className="flex min-h-14 items-center justify-end text-sm text-muted">パスワードを忘れた方</Link>}
      {signup&&<><label className="flex min-h-14 items-center gap-3 text-sm"><input type="checkbox" checked={publicRank} disabled={submitting} onChange={e=>setPublicRank(e.target.checked)} className="h-5 w-5 accent-accent"/>全体ランキングに参加する</label>
        <p className="text-xs leading-relaxed text-muted">参加すると、名前・アイコン・BIG3の重量がログイン中の利用者に公開されます。名前・アイコン・参加設定は後からプロフィールで変更できます。</p></>}
      {error&&<p role="alert" className="text-sm text-accent">{error}</p>}
      {signup&&<p className="text-xs leading-relaxed text-muted">登録すると、<Link to="/terms" className="text-accent underline">利用規約</Link>と<Link to="/privacy" className="text-accent underline">プライバシーポリシー</Link>に同意したものとみなします。</p>}
      <Button type="submit" disabled={submitting||(signup&&!name.trim())}>{submitting?'処理中…':signup?'アカウントを作成':'ログイン'}</Button>
      <Link className="flex min-h-14 items-center justify-center text-sm text-muted" to={signup?'/login':'/signup'}>{signup?'アカウントをお持ちの方':'アカウントを作成する'}</Link>
    </form>}</main>
}
