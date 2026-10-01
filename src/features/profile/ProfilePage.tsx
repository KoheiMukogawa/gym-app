import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { communityMessage, profile } from '../community/queries'
import { AvatarPicker } from './Avatar'
export function ProfilePage() {
  const { userId,profile:account,refreshProfile }=useSession()
  const [name,setName]=useState(''),[icon,setIcon]=useState('initials'),[bio,setBio]=useState(''),[publicRank,setPublicRank]=useState(false)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false),[attempt,setAttempt]=useState(0)
  useEffect(()=>{let active=true;setLoading(true);setError(null);if(userId)profile(userId).then(p=>{if(active){setName(p?.display_name??account?.display_name??'');setIcon(p?.icon??'initials');setBio(p?.bio??'');setPublicRank(p?.global_ranking??false)}}).catch(e=>{if(active)setError(communityMessage(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[userId,attempt])
  if(loading)return <Spinner/>
  return <section className="space-y-5 p-4"><h1 className="text-2xl font-semibold">プロフィール</h1>
    {error&&<div><p role="alert" className="text-sm text-accent">{error}</p><button className="min-h-14 text-sm" onClick={()=>setAttempt(n=>n+1)}>再読み込み</button></div>}
    <form className="space-y-5" onSubmit={async e=>{e.preventDefault();if(busy||!userId)return;setBusy(true);setError(null);setSaved(false);try{const {error:err}=await supabase.rpc('save_glog_profile',{p_name:name.trim(),p_icon:icon,p_bio:bio.trim(),p_global:publicRank});if(err)throw err;await refreshProfile();window.dispatchEvent(new Event('glog-profile-updated'));setSaved(true)}catch(e){setError(communityMessage(e))}finally{setBusy(false)}}}>
      <label className="block text-sm text-muted">名前<input required maxLength={30} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setSaved(false)}} className="mt-2 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg"/></label>
      <AvatarPicker value={icon} name={name} onChange={setIcon} disabled={busy}/>
      <label className="block text-sm text-muted">ひとこと<input maxLength={100} value={bio} disabled={busy} onChange={e=>setBio(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg"/></label>
      <label className="flex min-h-14 items-center gap-3 text-sm"><input type="checkbox" checked={publicRank} disabled={busy} onChange={e=>setPublicRank(e.target.checked)} className="h-5 w-5 accent-accent"/>全体ランキングに参加する</label>
      <p className="text-xs leading-relaxed text-muted">参加すると、名前・アイコン・BIG3の重量がログイン中の利用者に公開されます。いつでも参加を取り消せます。コミュニティ内の共有は所属している間のみです。</p>
      <Button type="submit" disabled={busy||!name.trim()}>{busy?'保存中…':'プロフィールを保存'}</Button>{saved&&<p role="status" className="text-sm">保存しました</p>}
    </form>
  </section>
}
