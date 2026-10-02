import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useSession } from '../auth/SessionProvider'
import { communityMessage, profile, saveDotsSettings, saveProfile, type CommunityProfile, type DotsFormula, type RankMetric } from './queries'

/** A visual invitation, not an access boundary: the RPC returns only shared records. */
export function RankingParticipation({ mode, global = false, onJoined, children }: {
  mode: RankMetric; global?: boolean; onJoined: () => void; children: ReactNode
}) {
  const { userId, profile: account } = useSession()
  const [mine, setMine] = useState<CommunityProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [dismissed, setDismissed] = useState<RankMetric | null>(null)
  const [formula, setFormula] = useState<DotsFormula | null>(null)
  const [name, setName] = useState('')
  const lock = useRef(false)

  useEffect(() => {
    let active = true
    setLoading(true); setLoadError(null); setEditing(false); setDismissed(null)
    if (!userId) { setLoading(false); return }
    profile(userId).then(p => {
      if (!active) return
      setMine(p); setFormula(p?.dots_formula ?? null)
      setName(p?.display_name ?? account?.display_name ?? '')
    }).catch(e => { if (active) setLoadError(communityMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, attempt, account?.display_name])

  const needsGlobal = global && !mine?.global_ranking
  const needsDots = mode === 'dots' && !mine?.dots_opt_in
  const gated = !!userId && (needsGlobal || needsDots)

  async function join() {
    if (!userId || lock.current || (needsDots && !formula)) return
    lock.current = true; setBusy(true); setError(null)
    let changed = false
    let completed = false
    try {
      let next = mine
      if (needsGlobal || !next) {
        next = { ...(next ?? { user_id: userId, icon: 'initials', bio: '' }), display_name: name.trim(), global_ranking: global || !!next?.global_ranking }
        await saveProfile(next)
        setMine(next); changed = true
      }
      if (needsDots) {
        await saveDotsSettings(true, formula)
        next = { ...next!, dots_opt_in: true, dots_formula: formula }
        setMine(next); changed = true
      }
      setEditing(false)
      completed = true
    } catch (e) { setError(communityMessage(e)) }
    finally {
      // Keep a partial failure visible; retry sends only the setting not yet saved.
      if (changed) window.dispatchEvent(new Event('glog-profile-updated'))
      if (completed) onJoined()
      lock.current = false; setBusy(false)
    }
  }

  if (loading) return <Spinner />
  if (loadError) return <div className="space-y-2"><p role="alert">参加設定を読み込めませんでした。{loadError}</p><Button onClick={() => setAttempt(n => n + 1)}>参加設定を再試行</Button></div>
  if (!gated) return <>{children}</>

  return <div className="space-y-3">
    <div className={`relative isolate rounded-2xl border border-border ${editing ? 'min-h-24' : 'min-h-64'}`}>
      <div inert aria-hidden="true" className={`pointer-events-none overflow-hidden select-none blur-[3px] opacity-50 ${editing ? 'max-h-24' : 'max-h-64'}`}>{children}</div>
      {dismissed !== mode && !editing && <div className="absolute inset-0 flex items-center justify-center bg-bg/40 p-3">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-lg">
          <h2 className="font-semibold">{mode === 'dots' ? '体重を考慮して、強さを比べよう' : 'あなたの記録をランキングへ'}</h2>
          <p className="mt-2 text-sm text-muted">{mode === 'dots' ? '係数を選んで、DOTSランキングに参加できます。' : 'BIG3の記録を公開して、その場で参加できます。'}</p>
          <Button className="mt-3 w-full" onClick={() => { setEditing(true); setError(null) }}>{mode === 'dots' ? '係数を選んで参加する' : '公開して参加する'}</Button>
          <button type="button" className="min-h-14 w-full text-sm text-muted" onClick={() => { setDismissed(mode); setEditing(false) }}>あとで</button>
        </div>
      </div>}
    </div>
    {dismissed === mode && <Button variant="ghost" onClick={() => { setDismissed(null); setEditing(true) }}>ランキングに参加する</Button>}
    {editing && <form className="space-y-3 rounded-2xl border border-border bg-surface p-4" aria-label="ランキングへの参加" onSubmit={e => { e.preventDefault(); void join() }}>
      <h2 className="font-semibold">{needsDots ? 'DOTSランキングに参加' : '全体ランキングに参加'}</h2>
      {needsGlobal && <p className="text-sm leading-relaxed">名前・アイコン・BIG3の重量をログイン中の利用者に公開します。</p>}
      <p className="text-xs text-muted">この参加操作で全トレーニング履歴やセットのメモは公開されません。プロフィールでいつでも参加を取り消せます。</p>
      {(needsGlobal || !mine) && <label className="block text-sm">表示名<input required maxLength={30} disabled={busy} value={name} onChange={e => setName(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border border-border bg-bg px-3" /></label>}
      {needsDots && <>
        <p className="text-sm leading-relaxed">DOTSスコアとBIG3の数値を共有します。スコアとBIG3合計から体重が推定できるため、体重の公開にも同意することになります。</p>
        <fieldset disabled={busy}><legend className="mb-2 text-sm">計算に使う係数</legend><div className="flex gap-2">{([['male', '男性用'], ['female', '女性用']] as const).map(([value, label]) => <label key={value} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-border"><input type="radio" name="ranking-dots-formula" checked={formula === value} onChange={() => setFormula(value)} />{label}</label>)}</div></fieldset>
        {!formula && <p className="text-xs text-muted">参加するには係数を選んでください。</p>}
        <Link to="/body" className="flex min-h-14 items-center text-sm text-accent">記録日の前後14日以内の体重を記録する</Link>
      </>}
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button type="submit" disabled={busy || ((needsGlobal || !mine) && !name.trim()) || (needsDots && !formula)}>{busy ? '参加設定を保存中…' : '公開に同意して参加する'}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(null) }}>キャンセル</Button>
    </form>}
  </div>
}
