import { useEffect, useMemo, useRef, useState } from 'react'
export function WheelNumber({label,value,unit,onEnter,min,format}:{label:string;value:number;unit:string;onEnter:(n:number)=>void;min?:number;format?:(n:number)=>string}){
  // min は自重種目のアシスト（マイナス）用。2.5kg刻みに揃える
  const start=unit==='kg'?Math.ceil((min??0)/2.5)*2.5:1
  const values=useMemo(()=>unit==='kg'?Array.from({length:Math.round((500-start)/2.5)+1},(_,i)=>start+i*2.5):Array.from({length:100},(_,i)=>i+1),[unit,start])
  const list=useRef<HTMLDivElement>(null),dragging=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const [index,setIndex]=useState(0),[draft,setDraft]=useState(String(value))
  useEffect(()=>{setDraft(String(value));if(dragging.current)return;const i=values.reduce((best,n,k)=>Math.abs(n-value)<Math.abs(values[best]-value)?k:best,0);setIndex(i);if(list.current)list.current.scrollTop=i*40},[value,values])
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[])
  return <div><label className="block text-center text-xs text-muted">{label}<input type="number" aria-label={label} inputMode={unit==='kg'?'decimal':'numeric'} min={unit==='kg'?(min??0):1} max={unit==='kg'?9999.9:9999} step={unit==='kg'?0.1:1} value={draft} onChange={e=>{const s=e.target.value;setDraft(s);const n=Number(s);if(s.trim()&&Number.isFinite(n))onEnter(n)}} onBlur={()=>setDraft(String(value))} className="mt-1 min-h-14 w-full rounded-xl bg-surface text-center text-3xl font-semibold tabular-nums text-fg"/></label>
    <div className="relative mt-2"><div className="pointer-events-none absolute inset-x-0 top-10 h-10 rounded-lg border-y border-border bg-surface"/>
      <div ref={list} aria-label={`${label}をスクロールで選択`} className="relative h-[120px] overflow-y-auto overscroll-contain [scrollbar-width:none]" onPointerDown={()=>{dragging.current=true}} onWheel={()=>{dragging.current=true}} onScroll={e=>{const next=Math.max(0,Math.min(values.length-1,Math.round(e.currentTarget.scrollTop/40)));setIndex(next);if(!dragging.current)return;onEnter(values[next]);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{dragging.current=false;list.current?.scrollTo({top:next*40})},180)}}>
        <div style={{height:(values.length+2)*40,position:'relative'}}>{values.slice(Math.max(0,index-4),Math.min(values.length,index+5)).map((n,k)=>{const i=Math.max(0,index-4)+k;return <button key={n} type="button" tabIndex={-1} style={{position:'absolute',top:(i+1)*40,height:40,width:'100%'}} className={`text-center tabular-nums ${i===index?'text-fg':'text-muted'}`} onClick={()=>{dragging.current=false;onEnter(n);list.current?.scrollTo({top:i*40,behavior:'smooth'})}}>{format?format(n):<>{n} <span className="text-xs">{unit}</span></>}</button>})}</div>
      </div>
    </div>
  </div>
}
