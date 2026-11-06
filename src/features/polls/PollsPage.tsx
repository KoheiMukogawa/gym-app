import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { PollCard } from './PollCard'
import { usePolls } from './usePolls'

/** 投票（POLL-01）。受付中の投票に投票でき、投票した投票と締め切った投票は結果を見られる。 */
export function PollsPage() {
  const { polls, error, refresh } = usePolls()
  return <div className="space-y-4 p-4">
    <PageHeader title="投票">
      <p className="text-sm leading-relaxed text-muted">アプリのこれからを、BARBELL CLUBを使っているマッチョ達と決めます。</p>
    </PageHeader>
    {error && <div className="space-y-3"><p role="alert" className="text-sm text-accent">投票を読み込めませんでした（{error}）</p>
      <Button variant="ghost" onClick={refresh}>再試行</Button></div>}
    {polls === null ? !error && <Spinner />
      : polls.length === 0 ? <p className="py-8 text-center text-sm text-muted">いまは投票はありません</p>
        : <div className="space-y-4">{polls.map((poll) => <PollCard key={poll.id} poll={poll} />)}</div>}
  </div>
}
