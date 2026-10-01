import type { LoggedSet } from './logReducer'
import type { SetStatus } from './persistence'
type Props={sets:LoggedSet[];exerciseNames:Record<string,string>;status:Record<string,SetStatus>;onUndo:()=>void;onRetry:(id:string)=>void;undoing:boolean}
export function SetList({sets,exerciseNames,status,onUndo,onRetry,undoing}:Props){
  if(!sets.length)return <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
  const ids=[...new Set(sets.map(s=>s.exercise_id))]
  return <div className="space-y-4">{ids.map(id=><section key={id} className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">{exerciseNames[id]??'種目'}</h2><ul className="divide-y divide-border">{sets.filter(s=>s.exercise_id===id).sort((a,b)=>a.set_index-b.set_index).map(s=><li key={s.id} className={`flex min-h-14 flex-wrap items-center justify-between gap-2 py-2 ${(status[s.id]??'saved')==='pending'?'opacity-50':''}`}><span className="text-sm text-muted">{s.set_index}set</span><span className="text-lg font-semibold tabular-nums">{s.weight_kg}<span className="text-xs font-normal text-muted"> kg × </span>{s.reps}<span className="text-xs font-normal text-muted"> 回</span></span>{status[s.id]==='failed'&&<button type="button" onClick={()=>onRetry(s.id)} className="min-h-14 text-xs text-accent">未保存・再試行</button>}</li>)}</ul></section>)}<button type="button" onClick={onUndo} disabled={undoing} className="min-h-14 w-full text-sm text-muted disabled:opacity-40">{undoing?'取り消し中…':'直前のセットを取り消す'}</button></div>
}
