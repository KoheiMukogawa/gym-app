import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { communityMessage, profile, saveDotsSettings, type DotsFormula } from '../community/queries'
import { AvatarPicker } from './Avatar'
import { Link } from 'react-router-dom'
export function ProfilePage() {
  const { userId,profile:account,refreshProfile }=useSession()
  const [name,setName]=useState(''),[icon,setIcon]=useState('initials'),[bio,setBio]=useState(''),[publicRank,setPublicRank]=useState(false)
  const [dotsOptIn,setDotsOptIn]=useState(false),[dotsFormula,setDotsFormula]=useState<DotsFormula|null>(null)
  // Last values stored on the server: an unchanged DOTS choice is not resent with every profile save.
  const [storedDots,setStoredDots]=useState<{optIn:boolean;formula:DotsFormula|null}>({optIn:false,formula:null})
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false),[attempt,setAttempt]=useState(0)
  useEffect(()=>{let active=true;setLoading(true);setError(null);if(userId)profile(userId).then(p=>{if(active){setName(p?.display_name??account?.display_name??'');setIcon(p?.icon??'initials');setBio(p?.bio??'');setPublicRank(p?.global_ranking??false);setDotsOptIn(p?.dots_opt_in??false);setDotsFormula(p?.dots_formula??null);setStoredDots({optIn:p?.dots_opt_in??false,formula:p?.dots_formula??null})}}).catch(e=>{if(active)setError(communityMessage(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[userId,attempt])
  if(loading)return <Spinner/>
  return <section className="space-y-5 p-4"><h1 className="text-2xl font-semibold">プロフィール</h1>
    {error&&<div><p role="alert" className="text-sm text-accent">{error}</p><button className="min-h-14 text-sm" onClick={()=>setAttempt(n=>n+1)}>再読み込み</button></div>}
    <form className="space-y-5" onSubmit={async e=>{e.preventDefault();if(busy||!userId)return;setBusy(true);setError(null);setSaved(false);try{const {error:err}=await supabase.rpc('save_glog_profile',{p_name:name.trim(),p_icon:icon,p_bio:bio.trim(),p_global:publicRank});if(err)throw err;if(dotsOptIn!==storedDots.optIn||dotsFormula!==storedDots.formula){await saveDotsSettings(dotsOptIn,dotsFormula);setStoredDots({optIn:dotsOptIn,formula:dotsFormula})}await refreshProfile();window.dispatchEvent(new Event('glog-profile-updated'));setSaved(true)}catch(e){setError(communityMessage(e))}finally{setBusy(false)}}}>
      <label className="block text-sm text-muted">名前<input required maxLength={30} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setSaved(false)}} className="mt-2 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg"/></label>
      <AvatarPicker value={icon} name={name} onChange={setIcon} disabled={busy}/>
      <label className="block text-sm text-muted">ひとこと<input maxLength={100} value={bio} disabled={busy} onChange={e=>setBio(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg"/></label>
      <label className="flex min-h-14 items-center gap-3 text-sm"><input type="checkbox" checked={publicRank} disabled={busy} onChange={e=>setPublicRank(e.target.checked)} className="h-5 w-5 accent-accent"/>全体ランキングに参加する</label>
      <p className="text-xs leading-relaxed text-muted">参加すると、名前・アイコン・BIG3の重量がログイン中の利用者に公開されます。いつでも参加を取り消せます。コミュニティ内の共有は所属している間のみです。</p>
      <label className="flex min-h-14 items-center gap-3 text-sm"><input type="checkbox" checked={dotsOptIn} disabled={busy} onChange={e=>{setDotsOptIn(e.target.checked);setSaved(false)}} className="h-5 w-5 accent-accent"/>DOTSランキングに参加する</label>
      {dotsOptIn&&<fieldset className="space-y-2"><legend className="text-sm text-muted">計算に使う係数</legend><div className="flex gap-2">{([['male','男性用'],['female','女性用']] as const).map(([value,label])=><label key={value} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm"><input type="radio" name="dots-formula" checked={dotsFormula===value} disabled={busy} onChange={()=>{setDotsFormula(value);setSaved(false)}} className="h-5 w-5 accent-accent"/>{label}</label>)}</div>{!dotsFormula&&<p className="text-xs text-muted">保存するには係数を選んでください。</p>}</fieldset>}
      <p className="text-xs leading-relaxed text-muted">記録日の前後14日以内の体重でスコアを計算します。スコアとBIG3合計から体重が推定できるため、参加する場合は体重の公開に同意したことになります。</p>
      <Button type="submit" disabled={busy||!name.trim()||(dotsOptIn&&!dotsFormula)}>{busy?'保存中…':'プロフィールを保存'}</Button>{saved&&<p role="status" className="text-sm">保存しました</p>}
    </form>
    <div className="space-y-2 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">体組成</h2>
      <p className="text-xs leading-relaxed text-muted">体重と体脂肪率は体組成タブで記録します。自分だけに表示されます。DOTSランキングに参加した場合だけ、スコアから体重が推定できます。</p>
      <Link to="/body" className="flex min-h-14 items-center text-sm text-accent">体組成を記録する →</Link>
    </div>
  </section>
}
