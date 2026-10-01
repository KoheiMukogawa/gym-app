import { useSearchParams } from 'react-router-dom'
import { StrengthPage } from '../strength/StrengthPage'
import { CommunityPanel } from './CommunityPanel'
export function Big3Page(){const [params,setParams]=useSearchParams();const view=params.get('view')===null?'self':'ranking';return <><nav className="mx-4 mt-4 flex rounded-xl border border-border p-1" aria-label="BIG3の表示">{[['self','自分'],['ranking','ランキング']].map(([id,label])=><button key={id} className={`min-h-14 flex-1 rounded-lg text-sm ${view===id?'bg-surface text-fg':'text-muted'}`} aria-pressed={view===id} onClick={()=>setParams(id==='self'?{}:{view:id})}>{label}</button>)}</nav>{view==='ranking'?<div className="p-4"><h1 className="mb-5 text-2xl font-semibold">ランキング</h1><CommunityPanel/></div>:<StrengthPage/>}</>}
