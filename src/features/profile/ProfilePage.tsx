import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { communityMessage, profile, saveDotsSettings, type DotsFormula } from '../community/queries'
import { AvatarPicker } from './Avatar'
import { isPhoto, removePhoto, uploadPhoto } from './photo'
import { PhotoCropper } from './PhotoCropper'
import { toMessage } from '../../lib/errors'
import { Link } from 'react-router-dom'
import { useLogInputMode } from '../workout-log/inputMode'
export function ProfilePage() {
  const { userId,profile:account,refreshProfile }=useSession()
  const inputMode=useLogInputMode(userId)
  const [name,setName]=useState(''),[icon,setIcon]=useState('initials'),[bio,setBio]=useState(''),[publicRank,setPublicRank]=useState(false)
  const [dotsOptIn,setDotsOptIn]=useState(false),[dotsFormula,setDotsFormula]=useState<DotsFormula|null>(null)
  // Last values stored on the server: an unchanged DOTS choice is not resent with every profile save.
  const [storedDots,setStoredDots]=useState<{optIn:boolean;formula:DotsFormula|null}>({optIn:false,formula:null})
  // 保存前に選んだ写真（縮めた画像と見本のURL）と、サーバーに保存済みのアイコン（古い写真を消すため）
  const [cropFile,setCropFile]=useState<File|null>(null)
  const [photo,setPhoto]=useState<{blob:Blob;url:string}|null>(null),[savedIcon,setSavedIcon]=useState('initials')
  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo.url)},[photo])
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false),[attempt,setAttempt]=useState(0)
  useEffect(()=>{let active=true;setLoading(true);setError(null);if(userId)profile(userId).then(p=>{if(active){setName(p?.display_name??account?.display_name??'');setIcon(p?.icon??'initials');setSavedIcon(p?.icon??'initials');setBio(p?.bio??'');setPublicRank(p?.global_ranking??false);setDotsOptIn(p?.dots_opt_in??false);setDotsFormula(p?.dots_formula??null);setStoredDots({optIn:p?.dots_opt_in??false,formula:p?.dots_formula??null})}}).catch(e=>{if(active)setError(communityMessage(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[userId,attempt])
  if(loading)return <Spinner/>
  return <section className="space-y-6 p-4"><header><h1 className="text-2xl font-semibold">プロフィール</h1></header>
    {error&&<div><p role="alert" className="text-sm text-accent">{error}</p><button className="min-h-14 text-sm" onClick={()=>setAttempt(n=>n+1)}>再読み込み</button></div>}
    <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(busy||!userId)return;setBusy(true);setError(null);setSaved(false);let uploaded:string|null=null;try{
      // 写真は保存のときに上げる。プロフィールの保存に失敗したら、上げた写真は消す
      let nextIcon=icon
      if(photo){try{uploaded=await uploadPhoto(userId,photo.blob)}catch(err){throw new Error(`写真を保存できませんでした。${toMessage(err)}`,{cause:err})}nextIcon=uploaded}
      const {error:err}=await supabase.rpc('save_glog_profile',{p_name:name.trim(),p_icon:nextIcon,p_bio:bio.trim(),p_global:publicRank});if(err)throw err;uploaded=null
      if(isPhoto(savedIcon)&&savedIcon!==nextIcon)void removePhoto(savedIcon).catch(()=>undefined)
      setSavedIcon(nextIcon);setIcon(nextIcon);setPhoto(null);if(dotsOptIn!==storedDots.optIn||dotsFormula!==storedDots.formula){await saveDotsSettings(dotsOptIn,dotsFormula);setStoredDots({optIn:dotsOptIn,formula:dotsFormula})}await refreshProfile();window.dispatchEvent(new Event('glog-profile-updated'));setSaved(true)}catch(e){if(uploaded)void removePhoto(uploaded).catch(()=>undefined);setError(e instanceof Error&&e.message.startsWith('写真を')?e.message:communityMessage(e))}finally{setBusy(false)}}}>
      <section aria-label="プロフィール設定" className="space-y-5 rounded-2xl border border-border bg-surface p-4">
      <div className="space-y-4"><h2 className="text-sm font-semibold">基本情報</h2>
      <label className="block text-sm text-muted">名前<input required maxLength={30} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setSaved(false)}} className="mt-2 min-h-14 w-full rounded-xl border border-border bg-bg px-4 text-fg"/></label>
      <AvatarPicker value={icon} name={name} onChange={v=>{setIcon(v);setPhoto(null);setSaved(false)}} disabled={busy}
        photoPreview={photo?.url??null}
        onPickPhoto={file=>{setError(null);setCropFile(file)}}/>
      {/* 選んだ写真のどこをアイコンにするかを決めてもらう */}
      {cropFile&&<PhotoCropper file={cropFile} onCancel={()=>setCropFile(null)} onDone={blob=>{setPhoto({blob,url:URL.createObjectURL(blob)});setCropFile(null);setSaved(false)}}/>}
      {(photo||isPhoto(icon))&&<p className="-mt-3 text-xs text-muted">写真は正方形に切り抜いて小さくし、撮影場所などの情報を消してから保存します。ほかの利用者にも表示されます。</p>}
      <label className="block text-sm text-muted">ひとこと<input maxLength={100} value={bio} disabled={busy} onChange={e=>setBio(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border border-border bg-bg px-4 text-fg"/></label>
      </div>
      <div className="space-y-3 border-t border-border pt-5"><h2 className="text-sm font-semibold">公開とランキング</h2>
      <label className="flex min-h-14 items-center gap-3"><input aria-label="全体ランキングに参加する" type="checkbox" checked={publicRank} disabled={busy} onChange={e=>setPublicRank(e.target.checked)} className="h-5 w-5 accent-accent"/><span><span className="block text-sm font-semibold">全体ランキング</span><span className="block text-xs text-muted">BIG3の記録で参加</span></span></label>
      <label className="flex min-h-14 items-center gap-3"><input aria-label="DOTSランキングに参加する" type="checkbox" checked={dotsOptIn} disabled={busy} onChange={e=>{setDotsOptIn(e.target.checked);setSaved(false)}} className="h-5 w-5 accent-accent"/><span><span className="block text-sm font-semibold">DOTSランキング</span><span className="block text-xs text-muted">体重を使った強さで比較</span></span></label>
      {dotsOptIn&&<fieldset className="space-y-2"><legend className="text-xs text-muted">係数</legend><div className="flex gap-2">{([['male','男性用'],['female','女性用']] as const).map(([value,label])=><label key={value} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm"><input type="radio" name="dots-formula" checked={dotsFormula===value} disabled={busy} onChange={()=>{setDotsFormula(value);setSaved(false)}} className="h-5 w-5 accent-accent"/>{label}</label>)}</div>{!dotsFormula&&<p className="text-xs text-muted">保存するには係数を選んでください。</p>}</fieldset>}
      <p className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-muted">参加中は名前・アイコン・BIG3をログイン中の利用者に公開します。DOTSはスコアから体重を推定できる場合があります。</p>
      </div>
      <Button type="submit" disabled={busy||!name.trim()||(dotsOptIn&&!dotsFormula)}>{busy?'保存中…':'プロフィールを保存'}</Button>{saved&&<p role="status" className="text-sm">保存しました</p>}
      </section>
    </form>
    <section role="radiogroup" aria-labelledby="log-input-mode-heading" className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div><h2 id="log-input-mode-heading" className="font-semibold">アプリ設定</h2><p className="mt-1 text-xs text-muted">記録の入れ方</p></div>
      {([['dial','ダイヤル','1セットずつダイヤルで合わせて「セット完了」'],['list','一覧','セットを表に並べて、重量と回数を数字で打つ']] as const).map(([value,label,description])=><label key={value} className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-4 py-2 text-sm"><input type="radio" name="log-input-mode" checked={inputMode.mode===value} onChange={()=>inputMode.setMode(value)} className="h-5 w-5 accent-accent"/><span><span className="block font-semibold">{label}</span><span className="block text-xs text-muted">{description}</span></span></label>)}
      <p className="text-xs leading-relaxed text-muted">この端末に保存します。</p>
    </section>
    <section className="space-y-1 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">アカウント</h2>
      <p className="pt-1 text-xs leading-relaxed text-muted">退会すると、記録とプロフィールはすべて削除されます。</p>
      <Link to="/account/delete" className="flex min-h-14 items-center text-sm text-muted">退会する</Link>
    </section>
  </section>
}
