import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { Avatar } from '../profile/Avatar'
import { communityMessage, rankMembers, type Member } from './queries'
export function GlobalRanking(){
 const {userId}=useSession();const [members,setMembers]=useState<Member[]>([]),[mode,setMode]=useState<'total'|'growth'>('total'),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0)
 useEffect(()=>{let active=true;setLoading(true);setError(null);Promise.resolve(supabase.rpc('global_ranking')).then(({data,error})=>{if(!active)return;if(error)setError(communityMessage(error));else setMembers(data??[]);setLoading(false)}).catch(e=>{if(active){setError(communityMessage(e));setLoading(false)}});return()=>{active=false}},[attempt])
 return <section className="space-y-4 p-4"><h1 className="text-2xl font-semibold">全体ランキング</h1><p className="text-xs leading-relaxed text-muted">公開を選んだ利用者のランキングです。BIG3は1〜10回の記録を推定1RMに換算。自己申告の記録です。</p><Link to="/profile" className="flex min-h-14 items-center text-sm text-accent">プロフィールで参加・公開設定</Link><div className="flex border-b border-border">{(['total','growth'] as const).map(m=><button key={m} aria-pressed={mode===m} className={`min-h-14 flex-1 text-sm ${mode===m?'border-b-2 border-accent':'text-muted'}`} onClick={()=>setMode(m)}>{m==='total'?'BIG3合計':'今月の伸び'}</button>)}</div>
 {mode==='growth'&&<p className="text-xs text-muted">日本時間の月初前に3種目がそろっている人を比較します。</p>}
 {loading?<Spinner/>:error?<div><p role="alert">{error}</p><Button onClick={()=>setAttempt(n=>n+1)}>再試行</Button></div>:!members.length?<p className="py-6 text-center text-sm text-muted">参加者はまだいません</p>:<ol className="divide-y divide-border">{rankMembers(members,mode).map(m=><li key={m.user_id} className={`flex min-h-20 items-center gap-3 px-2 ${m.user_id===userId?'bg-surface':''}`}><span className="w-6 text-sm text-muted">{m.rank??'—'}</span><Avatar icon={m.icon} name={m.display_name}/><span className="min-w-0 flex-1 break-words text-sm">{m.display_name}</span><strong className="shrink-0 tabular-nums">{m[mode]===null?'—':`${mode==='growth'?'+':''}${m[mode]} kg`}</strong></li>)}</ol>}</section>
}
