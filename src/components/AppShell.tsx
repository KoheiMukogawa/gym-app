import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Spinner } from './ui/Spinner'
import { useSession } from '../features/auth/SessionProvider'
import { toMessage } from '../lib/errors'
import { Avatar } from '../features/profile/Avatar'
import { LogPage } from '../features/workout-log/LogPage'
import { loadDraft } from '../features/workout-log/persistence'
import { useFeedbackInbox } from '../features/feedback/useFeedbackInbox'
// 記録画面へはホームのボタンから入る。過去分は履歴から追加できるのでタブには出さない。
const TABS=[{to:'/',label:'ホーム'},{to:'/history',label:'履歴'},{to:'/big3',label:'BIG3'},{to:'/ranking',label:'ランキング'},{to:'/body',label:'体組成'}]
export function AppShell(){
  const {signOut,profile,refreshProfile,userId}=useSession(),location=useLocation(),navigate=useNavigate()
  // トレーニングの途中でアプリを開き直したときは、ホームではなく記録画面から再開する
  const resumed=useRef(false)
  useEffect(()=>{if(resumed.current||!userId)return;resumed.current=true;if(location.pathname==='/'&&!location.search&&(loadDraft(userId)?.state.sets.length??0)>0)navigate('/log',{replace:true})},[userId,location.pathname,location.search,navigate])
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[logKey,setLogKey]=useState(0)
  // Mount recording on its first visit, then retain it across tab changes so
  // in-progress input survives without fetching its history on every launch.
  const [logOpened,setLogOpened]=useState(location.pathname==='/log')
  const showLog=logOpened||location.pathname==='/log'
  useEffect(()=>{if(location.pathname==='/log')setLogOpened(true)},[location.pathname])
  useEffect(()=>{const update=()=>{void refreshProfile().catch(()=>{})};window.addEventListener('glog-profile-updated',update);return()=>window.removeEventListener('glog-profile-updated',update)},[refreshProfile])
  // 管理者に未読の意見があれば、アイコンを赤い輪で囲んでメニューに件数を出す
  const unreadFeedback=useFeedbackInbox(),hasUnread=(unreadFeedback??0)>0
  const menu=useRef<HTMLDivElement>(null)
  useEffect(()=>setOpen(false),[location.pathname,location.search])
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node))setOpen(false)};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[open])
  return <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
    <header className="flex items-center justify-between px-4 py-2"><Link to="/" aria-label="Glog トップへ" className="flex min-h-14 items-center text-3xl font-bold tracking-tight">Glog</Link>
      <div ref={menu} className="relative"><button className="flex min-h-14 min-w-14 items-center justify-center" aria-label={hasUnread?'プロフィールメニュー（新着の意見があります）':'プロフィールメニュー'} data-unread={hasUnread||undefined} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span className={`relative inline-flex rounded-full ${hasUnread?'ring-2 ring-accent ring-offset-2 ring-offset-bg':''}`}><Avatar icon={profile?.icon} name={profile?.display_name}/>{hasUnread&&<span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg bg-accent"/>}</span></button>
        {open&&<div className="absolute right-0 z-50 w-64 rounded-xl border border-border bg-surface p-3 shadow-xl"><p className="break-words px-3 py-2 font-semibold">{profile?.display_name||'プロフィール'}</p><Link to="/profile" className="flex min-h-14 items-center px-3 text-sm">プロフィールを編集</Link><Link to="/export" className="flex min-h-14 items-center px-3 text-sm">データをエクスポート</Link><Link to="/feedback" className="flex min-h-14 items-center px-3 text-sm">ご意見・不具合を送る</Link>{unreadFeedback!==null&&<Link to="/admin/feedback" className="flex min-h-14 items-center gap-2 px-3 text-sm">届いた意見{hasUnread&&<span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">新着 {unreadFeedback}</span>}</Link>}<Link to="/terms" className="flex min-h-14 items-center px-3 text-sm text-muted">利用規約</Link><Link to="/privacy" className="flex min-h-14 items-center px-3 text-sm text-muted">プライバシーポリシー</Link>{error&&<p role="alert" className="text-sm text-accent">{error}</p>}<button className="min-h-14 w-full px-3 text-left text-sm text-muted" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await signOut()}catch(e){setError(toMessage(e))}finally{setBusy(false)}}}>{busy?'ログアウト中…':'ログアウト'}</button></div>}
      </div></header>
    <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">{showLog&&<div hidden={location.pathname!=='/log'}><LogPage key={logKey} onFinished={()=>setLogKey(k=>k+1)}/></div>}<Suspense fallback={<Spinner/>}><Outlet/></Suspense></main>
    <nav aria-label="メイン" className="glass-navigation fixed inset-x-3 bottom-[calc(0.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[calc(32rem-1.5rem)] rounded-full">{TABS.map(t=><NavLink key={t.to} to={t.to} end={t.to==='/'} className="flex h-14 min-h-14 min-w-0 flex-1 items-center justify-center rounded-full px-0.5 text-xs">{({isActive})=><span className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-full transition-colors ${isActive?'bg-white/10 font-semibold text-accent':'text-fg/75 hover:bg-white/5'}`}>{t.label}</span>}</NavLink>)}</nav>
  </div>
}
