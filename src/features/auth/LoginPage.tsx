import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'
import { Button } from '../../components/ui/Button'
import { useSession } from './SessionProvider'
import { AvatarPicker } from '../profile/Avatar'
export function LoginPage({ signup = false }: { signup?: boolean }) {
  const { userId, loading } = useSession()
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[icon,setIcon]=useState('initials')
  const [error,setError]=useState<string|null>(null),[submitting,setSubmitting]=useState(false),[sent,setSent]=useState(false)
  if(!loading&&userId)return <Navigate to={signup?'/profile':'/'} replace/>
  async function submit(e:FormEvent){e.preventDefault();if(submitting)return;setError(null);setSubmitting(true)
    try{const result=signup?await supabase.auth.signUp({email,password,options:{data:{display_name:name.trim(),profile_icon:icon},emailRedirectTo:window.location.origin+'/profile'}}):await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(signup&&!result.data.session)setSent(true)}catch(e){const code=(e as {code?:string})?.code;setError(code==='signup_disabled'?'現在、新規登録の受付は準備中です。しばらくしてからお試しください。':toMessage(e))}finally{setSubmitting(false)}}
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-8"><Link to="/" className="mb-8 text-4xl font-bold tracking-tight">Glog</Link><h1 className="mb-6 text-xl font-semibold">{signup?'プロフィールを作って始める':'ログイン'}</h1>
    {sent?<div className="space-y-4"><p role="status">確認メールを送信しました。メール内のリンクを開いて登録を完了してください。</p><Link to="/login" className="flex min-h-14 items-center text-accent">ログインへ</Link></div>:<form onSubmit={submit} className="space-y-4">
      {signup&&<><label className="block text-sm text-muted">名前<input required maxLength={30} value={name} onChange={e=>setName(e.target.value)} className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" disabled={submitting}/></label><AvatarPicker value={icon} name={name} onChange={setIcon} disabled={submitting}/></>}
      <label className="block text-sm text-muted">メールアドレス<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" disabled={submitting}/></label>
      <label className="block text-sm text-muted">パスワード<input type="password" minLength={signup?8:undefined} autoComplete={signup?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" disabled={submitting}/></label>
      {signup&&<p className="text-xs text-muted">8文字以上。名前とアイコンは後から変更できます。ランキングへの公開は登録後に選べます。</p>}
      {error&&<p role="alert" className="text-sm text-accent">{error}</p>}
      <Button type="submit" disabled={submitting||(signup&&!name.trim())}>{submitting?'処理中…':signup?'アカウントを作成':'ログイン'}</Button>
      <Link className="flex min-h-14 items-center justify-center text-sm text-muted" to={signup?'/login':'/signup'}>{signup?'アカウントをお持ちの方':'アカウントを作成する'}</Link>
    </form>}</main>
}
