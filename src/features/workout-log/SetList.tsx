import { SwipeRow } from '../../components/SwipeRow'
import type { LoggedSet } from './logReducer'
import type { SetStatus } from './persistence'
import { formatAddedLoad } from '../../lib/bodyweight'

type Props={sets:LoggedSet[];exerciseNames:Record<string,string>;status:Record<string,SetStatus>;onDelete:(id:string)=>Promise<void>|void;onRetry:(id:string)=>void;deletingId:string|null;bodyweightIds?:string[]}

export function SetList({sets,exerciseNames,status,onDelete,onRetry,deletingId,bodyweightIds=[]}:Props){
  if(!sets.length)return <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
  const ids=[...new Set(sets.map(s=>s.exercise_id))]
  return <div className="space-y-4">{ids.map(id=><section key={id} className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">{exerciseNames[id]??'種目'}</h2><ul className="divide-y divide-border">{sets.filter(s=>s.exercise_id===id).sort((a,b)=>a.set_index-b.set_index).map((s,i)=><SwipeRow key={s.id} label={`${exerciseNames[id]??'種目'} ${i+1}set ${bodyweightIds.includes(id)?formatAddedLoad(s.weight_kg):s.weight_kg+'kg'} × ${s.reps}回を削除`} disabled={deletingId!==null} deleting={deletingId===s.id} onDelete={()=>onDelete(s.id)} className={(status[s.id]??'saved')==='pending'?'opacity-50':''}><span className="text-sm text-muted">{i+1}set</span><span className="text-lg font-semibold tabular-nums">{bodyweightIds.includes(id)?<>{formatAddedLoad(s.weight_kg)}<span className="text-xs font-normal text-muted"> × </span></>:<>{s.weight_kg}<span className="text-xs font-normal text-muted"> kg × </span></>}{s.reps}<span className="text-xs font-normal text-muted"> 回</span></span>{status[s.id]==='failed'&&<button type="button" onClick={()=>onRetry(s.id)} className="min-h-14 text-xs text-accent">未保存・再試行</button>}</SwipeRow>)}</ul></section>)}<p className="text-center text-xs text-muted">セットを左にスワイプすると削除できます</p></div>
}
