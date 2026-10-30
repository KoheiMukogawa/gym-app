import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Spinner } from './ui/Spinner'
import { useSession } from '../features/auth/SessionProvider'
import { toMessage } from '../lib/errors'
import { Avatar } from '../features/profile/Avatar'
import { LogPage } from '../features/workout-log/LogPage'
import { loadDraft } from '../features/workout-log/persistence'
import { useFeedbackInbox } from '../features/feedback/useFeedbackInbox'
import { useFeedbackReplies } from '../features/feedback/useFeedbackReplies'
import { FeedbackReplyGate } from '../features/feedback/FeedbackReplyGate'
import { AnnouncementsGate } from '../features/announcements/AnnouncementsGate'
import { InstallGate } from '../features/install/InstallGate'
import { canGuideInstall, currentInstallEnv } from '../features/install/installEnv'
import { openInstallGuide } from '../features/install/installGuide'
import { ScreenErrorBoundary } from './ScreenErrorBoundary'
import { loadShowScreenIds, saveShowScreenIds, screenIdFor, type LogScreen } from '../features/admin/screenIds'
import { ButtonIdOverlay } from '../features/admin/ButtonIdOverlay'
import { copyId } from '../features/admin/copyId'
import { useToast } from './ui/Toast'
import { BottomDockContext } from './ui/BottomDockContext'
// 記録画面へはホームのボタンから入る。過去分は履歴から追加できるのでタブには出さない。
const TABS=[{to:'/',label:'ホーム'},{to:'/history',label:'履歴'},{to:'/big3',label:'BIG3'},{to:'/ranking',label:'ランキング'},{to:'/body',label:'体組成'}]
const MENU_ITEM='flex min-h-14 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-white/5'
const MENU_HEADING='px-3 pb-1 pt-3 text-[10px] font-semibold tracking-wider text-muted'
export function AppShell(){
  const {signOut,profile,refreshProfile,userId}=useSession(),location=useLocation(),navigate=useNavigate()
  const {show}=useToast()
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
  // 送った意見に運営の返信があれば、同じ赤い輪で知らせる（管理者以外も）
  const replies=useFeedbackReplies(),hasReply=replies.length>0,marked=hasUnread||hasReply
  // 管理者だけ、要望を伝えやすいよう画面ID（docs/screens.md）をヘッダーに出せる
  const isAdmin=unreadFeedback!==null,[showScreenIds,setShowScreenIds]=useState(loadShowScreenIds),[pickingExercise,setPickingExercise]=useState(true),[logScreen,setLogScreen]=useState<LogScreen>('REC-01')
  const currentScreenId=isAdmin?screenIdFor(location.pathname,logScreen):null
  const screenId=showScreenIds?currentScreenId:null
  const [root,setRoot]=useState<HTMLDivElement|null>(null)
  // 下部入力ドックを使う間はタブを隠し、画面の下端まで使う。ホームへはロゴから戻れる
  const [historyDockOpen,setHistoryDockOpen]=useState(false)
  const fullHeightDock=(location.pathname==='/log'&&!pickingExercise)||historyDockOpen
  const [installable]=useState(()=>canGuideInstall(currentInstallEnv()))
  const menu=useRef<HTMLDivElement>(null)
  useEffect(()=>setOpen(false),[location.pathname,location.search])
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node))setOpen(false)};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[open])
  return <div ref={setRoot} className="mx-auto flex min-h-dvh max-w-lg flex-col">
    <ButtonIdOverlay screenId={screenId} root={root}/>
    <header className="flex items-center justify-between px-4 py-2"><div className="flex items-center gap-2"><Link to="/" aria-label="Glog トップへ" className="flex min-h-14 items-center text-3xl font-bold tracking-tight">Glog</Link>{screenId&&<button type="button" data-id-copy aria-label={`画面ID ${screenId}をコピー`} onClick={()=>void copyId(screenId).then(ok=>show(ok?`${screenId} をコピーしました`:'コピーできませんでした'))} className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted active:bg-border">{screenId}</button>}</div>
      <div ref={menu} className="relative"><button className="flex min-h-14 min-w-14 items-center justify-center" aria-label={hasUnread?'プロフィールメニュー（新着の意見があります）':hasReply?'プロフィールメニュー（ご意見に返信があります）':'プロフィールメニュー'} data-unread={marked||undefined} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span className={`relative inline-flex rounded-full ${marked?'ring-2 ring-accent ring-offset-2 ring-offset-bg':''}`}><Avatar icon={profile?.icon} name={profile?.display_name}/>{marked&&<span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg bg-accent"/>}</span></button>
        {open&&<div className="absolute right-0 z-50 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-xl">
          <Link to="/profile" aria-label="プロフィールを編集" className="flex min-h-16 items-center gap-3 rounded-xl px-3 hover:bg-white/5"><Avatar icon={profile?.icon} name={profile?.display_name}/><span className="min-w-0"><strong className="block truncate text-sm">{profile?.display_name||'プロフィール'}</strong><span className="mt-0.5 block text-xs text-muted">プロフィールを編集</span></span></Link>
          <section aria-labelledby="menu-settings"><h2 id="menu-settings" className={MENU_HEADING}>データとアプリ</h2>
            <Link to="/export" className={MENU_ITEM}>データをエクスポート</Link>
            {installable&&<button type="button" className={MENU_ITEM} onClick={()=>{setOpen(false);openInstallGuide()}}>ホーム画面に追加</button>}
          </section>
          <section aria-labelledby="menu-support" className="border-t border-border"><h2 id="menu-support" className={MENU_HEADING}>サポート</h2>
            <Link to="/feedback" className={`${MENU_ITEM} gap-2`}>ご意見・不具合を送る{hasReply&&<span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">返信 {replies.length}</span>}</Link>
          </section>
          {unreadFeedback!==null&&<section aria-labelledby="menu-admin" className="border-t border-border"><h2 id="menu-admin" className={MENU_HEADING}>管理</h2>
            <Link to="/admin/feedback" className={`${MENU_ITEM} gap-2`}>届いた意見{hasUnread&&<span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">新着 {unreadFeedback}</span>}</Link>
            <Link to="/admin/usage" className={MENU_ITEM}>利用状況</Link>
            <button type="button" role="switch" aria-checked={showScreenIds} className={`${MENU_ITEM} justify-between`} onClick={()=>{const next=!showScreenIds;setShowScreenIds(next);saveShowScreenIds(next)}}><span>画面IDを表示</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${showScreenIds?'bg-accent text-white':'border border-border text-muted'}`}>{showScreenIds?'オン':'オフ'}</span></button>
          </section>}
          <section aria-labelledby="menu-about" className="border-t border-border"><h2 id="menu-about" className={MENU_HEADING}>このアプリについて</h2>
            <nav aria-label="このアプリについて">
              <Link to="/terms" className={`${MENU_ITEM} text-[13px] text-muted`}>利用規約</Link>
              <Link to="/privacy" className={`${MENU_ITEM} whitespace-nowrap text-[13px] text-muted`}>プライバシーポリシー</Link>
            </nav>
          </section>
          <footer className="border-t border-border px-3 pt-1">
            {error&&<p role="alert" className="py-2 text-sm text-accent">{error}</p>}<button className="min-h-12 w-full text-left text-sm text-muted" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await signOut()}catch(e){setError(toMessage(e))}finally{setBusy(false)}}}>{busy?'ログアウト中…':'ログアウト'}</button>
          </footer>
        </div>}
      </div></header>
    <main className={`flex-1 ${fullHeightDock?'':'pb-[max(5rem,calc(4rem+env(safe-area-inset-bottom)))]'}`}>{showLog&&<div hidden={location.pathname!=='/log'}><ScreenErrorBoundary key={logKey}><LogPage onFinished={()=>setLogKey(k=>k+1)} onPickingChange={setPickingExercise} onScreenChange={setLogScreen}/></ScreenErrorBoundary></div>}<ScreenErrorBoundary key={location.pathname}><Suspense fallback={<Spinner/>}><BottomDockContext.Provider value={setHistoryDockOpen}><Outlet/></BottomDockContext.Provider></Suspense></ScreenErrorBoundary></main>
    <AnnouncementsGate/>
    <InstallGate/>
    <FeedbackReplyGate unseen={replies}/>
    {/* LINEなどと同じく、ホームインジケーターの領域に少し重ねて下端に寄せる */}
    {!fullHeightDock&&<nav aria-label="メイン" className="glass-navigation fixed inset-x-5 bottom-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.75rem))] z-40 mx-auto flex max-w-[calc(32rem-2.5rem)] rounded-full">{TABS.map(t=><NavLink key={t.to} to={t.to} end={t.to==='/'} className="flex h-14 min-h-14 min-w-0 flex-1 items-center justify-center rounded-full px-0.5 text-xs">{({isActive})=><span className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-full transition-colors ${isActive?'bg-white/10 font-semibold text-accent':'text-fg/75 hover:bg-white/5'}`}>{t.label}</span>}</NavLink>)}</nav>}
  </div>
}
