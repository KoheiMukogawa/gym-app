import { CommunityPanel } from './CommunityPanel'

/** Rankings live on their own bottom tab so the BIG3 page stays about the user's own lifts. */
export function RankingPage() {
  return <div className="p-4"><h1 className="mb-5 text-2xl font-semibold">ランキング</h1><CommunityPanel /></div>
}
