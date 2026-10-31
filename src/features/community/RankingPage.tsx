import { CommunityPanel } from './CommunityPanel'
import { PageHeader } from '../../components/PageHeader'

/** Rankings live on their own bottom tab so the BIG3 page stays about the user's own lifts. */
export function RankingPage() {
  return <div className="flex flex-col gap-6 p-4"><PageHeader title="ランキング" /><CommunityPanel /></div>
}
