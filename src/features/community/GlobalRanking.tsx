import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { Avatar } from '../profile/Avatar'
import { communityMessage, formatMetric, rankMembers, type Member, type RankMetric } from './queries'
import { DotsNotice, MetricTabs } from './RankingParts'
export function GlobalRanking(){
 const {userId}=useSession();const [members,setMembers]=useState<Member[]>([]),[mode,setMode]=useState<RankMetric>('total'),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0)
 useEffect(()=>{let active=true;setLoading(true);setError(null);Promise.resolve(supabase.rpc('global_ranking')).then(({data,error})=>{if(!active)return;if(error)setError(communityMessage(error));else setMembers(data??[]);setLoading(false)}).catch(e=>{if(active){setError(communityMessage(e));setLoading(false)}});return()=>{active=false}},[attempt])
 const rows=rankMembers(members,mode)
 return <section className="space-y-4" aria-label="全体ランキング"><MetricTabs value={mode} onChange={setMode}/>
 {loading?<Spinner/>:error?<div><p role="alert">{error}</p><Button onClick={()=>setAttempt(n=>n+1)}>再試行</Button></div>:!rows.length?<p className="py-6 text-center text-sm text-muted">参加者はまだいません</p>:<ol className="divide-y divide-border">{rows.map(m=><li key={m.user_id} className={`flex min-h-20 items-center gap-3 px-2 ${m.user_id===userId?'bg-surface':''}`}><span className="w-6 text-sm text-muted">{m.rank??'—'}</span><Avatar icon={m.icon} name={m.display_name}/><span className="min-w-0 flex-1 break-words text-sm">{m.display_name}</span><strong className="shrink-0 tabular-nums">{formatMetric(m[mode],mode)}</strong></li>)}</ol>}
 {/* 説明はランキングの下。まず順位が目に入るようにする。 */}
 <div className="space-y-1 border-t border-border pt-3">
  {mode==='growth'&&<p className="text-xs text-muted">日本時間の月初前に3種目がそろっている人を比較します。</p>}
  {mode==='dots'&&!loading&&!error&&<DotsNotice me={members.find(m=>m.user_id===userId)}/>}
  <p className="text-xs leading-relaxed text-muted">公開を選んだ利用者のランキングです。BIG3は1〜10回の記録を推定1RMに換算。自己申告の記録です。</p>
  <Link to="/profile" className="flex min-h-14 items-center text-sm text-accent">全体ランキングへの参加はプロフィールで設定</Link>
 </div></section>
}
