import { useSearchParams } from 'react-router-dom'
import { StrengthPage } from '../strength/StrengthPage'
import { CommunityPanel } from './CommunityPanel'
export function Big3Page() {
  const [params, setParams] = useSearchParams()
  const community = params.get('view') === 'community'
  return <>
    <nav className="mx-4 mt-4 flex rounded-xl border border-border p-1" aria-label="Big3の表示">
      <button className={`min-h-14 flex-1 rounded-lg text-sm ${!community ? 'bg-surface text-fg' : 'text-muted'}`} aria-pressed={!community} onClick={() => setParams({})}>自分</button>
      <button className={`min-h-14 flex-1 rounded-lg text-sm ${community ? 'bg-surface text-fg' : 'text-muted'}`} aria-pressed={community} onClick={() => setParams({ view: 'community' })}>コミュニティ</button>
    </nav>
    {community ? <div className="p-4"><h1 className="mb-5 text-2xl font-semibold">仲間と競う</h1><CommunityPanel /></div> : <StrengthPage />}
  </>
}
