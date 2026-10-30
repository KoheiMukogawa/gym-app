import { CommunityPanel } from './CommunityPanel'

/** Rankings live on their own bottom tab so the BIG3 page stays about the user's own lifts. */
export function RankingPage() {
  return <div className="px-4 pb-4 pt-1"><h1 className="mb-3 text-2xl font-semibold">ランキング</h1><CommunityPanel /></div>
}
