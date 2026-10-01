import { useRef, useState, type ReactNode, type PointerEvent } from 'react'
import type { LoggedSet } from './logReducer'
import type { SetStatus } from './persistence'

type Props={sets:LoggedSet[];exerciseNames:Record<string,string>;status:Record<string,SetStatus>;onDelete:(id:string)=>Promise<void>|void;onRetry:(id:string)=>void;deletingId:string|null}

// 削除ボタンの幅。主要操作のタップ領域（56px以上）を満たす。
const REVEAL=88

/** メールアプリのように、左へスワイプすると削除ボタンが現れ、大きくスワイプするとそのまま削除する行。 */
function SwipeRow({children,label,onDelete,disabled,className}:{children:ReactNode;label:string;onDelete:()=>Promise<void>|void;disabled:boolean;className:string}){
  const [offset,setOffset]=useState(0),[dragging,setDragging]=useState(false)
  const row=useRef<HTMLLIElement>(null)
  const start=useRef<{x:number;y:number;base:number}|null>(null)
  const moved=useRef(false)
  function close(){setOffset(0)}
  function remove(){if(disabled)return;void Promise.resolve(onDelete()).finally(close)}
  function down(e:PointerEvent<HTMLDivElement>){if(disabled||(e.pointerType==='mouse'&&e.button!==0))return;start.current={x:e.clientX,y:e.clientY,base:offset};moved.current=false}
  function move(e:PointerEvent<HTMLDivElement>){
    const s=start.current;if(!s)return
    const dx=e.clientX-s.x,dy=e.clientY-s.y
    if(!moved.current){
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return
      // 縦方向の動きはスクロールとして扱い、スワイプにしない
      if(Math.abs(dy)>Math.abs(dx)){start.current=null;return}
      moved.current=true;setDragging(true);e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    setOffset(Math.min(0,s.base+dx))
  }
  function up(){
    start.current=null
    if(!moved.current)return
    setDragging(false)
    const width=row.current?.offsetWidth||320
    if(offset<-width*0.5){setOffset(-width);remove()}
    else setOffset(offset<-REVEAL/2?-REVEAL:0)
  }
  function cancel(){start.current=null;if(moved.current){setDragging(false);setOffset(o=>o<-REVEAL/2?-REVEAL:0)}}
  return <li ref={row} className={`relative overflow-hidden ${className}`}>
    <button type="button" aria-label={label} disabled={disabled} onClick={remove} onFocus={()=>setOffset(-REVEAL)} onBlur={close}
      className="absolute inset-y-0 right-0 flex items-center justify-end bg-accent pr-6 text-sm font-semibold text-white disabled:opacity-60" style={{width:Math.max(REVEAL,-offset)}}>{disabled?'削除中…':'削除'}</button>
    <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
      onClickCapture={e=>{if(moved.current){e.stopPropagation();e.preventDefault();moved.current=false}else if(offset!==0){e.stopPropagation();close()}}}
      className={`relative flex min-h-14 touch-pan-y flex-wrap items-center justify-between gap-2 bg-surface py-2 ${dragging?'':'transition-transform duration-200'}`}
      style={{transform:`translateX(${offset}px)`}}>{children}</div>
  </li>
}

export function SetList({sets,exerciseNames,status,onDelete,onRetry,deletingId}:Props){
  if(!sets.length)return <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
  const ids=[...new Set(sets.map(s=>s.exercise_id))]
  return <div className="space-y-4">{ids.map(id=><section key={id} className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">{exerciseNames[id]??'種目'}</h2><ul className="divide-y divide-border">{sets.filter(s=>s.exercise_id===id).sort((a,b)=>a.set_index-b.set_index).map((s,i)=><SwipeRow key={s.id} label={`${exerciseNames[id]??'種目'} ${i+1}set ${s.weight_kg}kg × ${s.reps}回を削除`} disabled={deletingId!==null} onDelete={()=>onDelete(s.id)} className={(status[s.id]??'saved')==='pending'?'opacity-50':''}><span className="text-sm text-muted">{i+1}set</span><span className="text-lg font-semibold tabular-nums">{s.weight_kg}<span className="text-xs font-normal text-muted"> kg × </span>{s.reps}<span className="text-xs font-normal text-muted"> 回</span></span>{status[s.id]==='failed'&&<button type="button" onClick={()=>onRetry(s.id)} className="min-h-14 text-xs text-accent">未保存・再試行</button>}</SwipeRow>)}</ul></section>)}<p className="text-center text-xs text-muted">セットを左にスワイプすると削除できます</p></div>
}
