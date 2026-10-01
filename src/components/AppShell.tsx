import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '../features/auth/SessionProvider'
import { toMessage } from '../lib/errors'
import { Avatar } from '../features/profile/Avatar'
import { LogPage } from '../features/workout-log/LogPage'
import { loadDraft } from '../features/workout-log/persistence'
const TABS=[{to:'/',label:'ホーム'},{to:'/log',label:'記録'},{to:'/history',label:'履歴'},{to:'/big3',label:'BIG3'}]
export function AppShell(){
  const {signOut,profile,refreshProfile,userId}=useSession(),location=useLocation(),navigate=useNavigate()
  // トレーニングの途中でアプリを開き直したときは、ホームではなく記録画面から再開する
  const resumed=useRef(false)
  useEffect(()=>{if(resumed.current||!userId)return;resumed.current=true;if(location.pathname==='/'&&!location.search&&(loadDraft(userId)?.state.sets.length??0)>0)navigate('/log',{replace:true})},[userId,location.pathname,location.search,navigate])
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[logKey,setLogKey]=useState(0)
  useEffect(()=>{const update=()=>{void refreshProfile().catch(()=>{})};window.addEventListener('glog-profile-updated',update);return()=>window.removeEventListener('glog-profile-updated',update)},[refreshProfile])
  const menu=useRef<HTMLDivElement>(null)
  useEffect(()=>setOpen(false),[location.pathname,location.search])
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node))setOpen(false)};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[open])
  return <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
    <header className="flex items-center justify-between px-4 py-2"><Link to="/" aria-label="Glog トップへ" className="flex min-h-14 items-center text-3xl font-bold tracking-tight">Glog</Link>
      <div ref={menu} className="relative"><button className="flex min-h-14 min-w-14 items-center justify-center" aria-label="プロフィールメニュー" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Avatar icon={profile?.icon} name={profile?.display_name}/></button>
        {open&&<div className="absolute right-0 z-50 w-64 rounded-xl border border-border bg-surface p-3 shadow-xl"><p className="break-words px-3 py-2 font-semibold">{profile?.display_name||'プロフィール'}</p><Link to="/profile" className="flex min-h-14 items-center px-3 text-sm">プロフィールを編集</Link>{error&&<p role="alert" className="text-sm text-accent">{error}</p>}<button className="min-h-14 w-full px-3 text-left text-sm text-muted" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await signOut()}catch(e){setError(toMessage(e))}finally{setBusy(false)}}}>{busy?'ログアウト中…':'ログアウト'}</button></div>}
      </div></header>
    <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]"><div hidden={location.pathname!=='/log'}><LogPage key={logKey} onFinished={()=>setLogKey(k=>k+1)}/></div><Outlet/></main>
    <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">{TABS.map(t=><NavLink key={t.to} to={t.to} end={t.to==='/'} className={({isActive})=>`flex min-h-16 flex-1 items-center justify-center text-sm ${isActive?'font-semibold text-accent':'text-muted'}`}>{t.label}</NavLink>)}</nav>
  </div>
}
