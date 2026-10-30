import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { Avatar } from '../profile/Avatar'
import { communityMessage, formatMetric, rankMembers, type Member, type RankLift, type RankMetric } from './queries'
import { DotsNotice, LiftFilter, MetricTabs } from './RankingParts'
import { RankingParticipation } from './RankingParticipation'
import { MemberDetail } from './MemberDetail'
export function GlobalRanking(){
 const {userId}=useSession();const [members,setMembers]=useState<Member[]>([]),[mode,setMode]=useState<RankMetric>('total'),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0),[lift,setLift]=useState<RankLift|null>(null),[person,setPerson]=useState<string|null>(null)
 useEffect(()=>{let active=true;setLoading(true);setError(null);Promise.resolve(supabase.rpc('global_ranking')).then(({data,error})=>{if(!active)return;if(error)setError(communityMessage(error));else setMembers(data??[]);setLoading(false)}).catch(e=>{if(active){setError(communityMessage(e));setLoading(false)}});return()=>{active=false}},[attempt])
 const rows=rankMembers(members,mode,lift)
 const detail=members.find(member=>member.user_id===person)
 return <section className="space-y-3" aria-label="全体ランキング"><MetricTabs value={mode} onChange={setMode}/>
 {mode==='total'&&<LiftFilter value={lift} onChange={setLift}/>}
 {loading?<Spinner/>:error?<div><p role="alert">{error}</p><Button onClick={()=>setAttempt(n=>n+1)}>再試行</Button></div>:<RankingParticipation mode={mode} global onJoined={()=>setAttempt(n=>n+1)}>{!rows.length?<p className="min-h-64 py-6 text-center text-sm text-muted">参加者はまだいません</p>:<ol className="divide-y divide-border">{rows.map(m=><li key={m.user_id}><button type="button" className={`flex min-h-20 w-full items-center gap-3 px-2 text-left ${m.user_id===userId?'bg-surface':''}`} onClick={()=>setPerson(m.user_id)}><span className="w-6 text-sm text-muted">{m.rank??'—'}</span><Avatar icon={m.icon} name={m.display_name} size="h-12 w-12"/><span className="min-w-0 flex-1 break-words text-base">{m.display_name}{m.user_id===userId&&<span className="ml-2 text-xs text-muted">自分</span>}</span><strong className="shrink-0 tabular-nums">{formatMetric(m.value,mode)}</strong></button></li>)}</ol>}</RankingParticipation>}
 {detail&&<MemberDetail member={detail} onClose={()=>setPerson(null)}/>}
 {/* 説明はランキングの下。まず順位が目に入るようにする。 */}
 <div className="space-y-1 border-t border-border pt-3">
  {mode==='total'&&lift&&<p className="text-xs text-muted">その種目の最高推定1RMで比較します。記録がない人は — です。</p>}
  {mode==='growth'&&<p className="text-xs text-muted">日本時間の月初前に3種目がそろっている人を比較します。</p>}
  {mode==='dots'&&!loading&&!error&&<DotsNotice me={members.find(m=>m.user_id===userId)}/>}
  {mode!=='dots'&&<p className="text-xs leading-relaxed text-muted">公開を選んだ人の自己申告記録です。1〜10回の記録は推定1RMに換算します。</p>}
  <Link to="/profile" className="flex min-h-14 items-center text-sm text-accent">公開設定を変更する</Link>
 </div></section>
}
