import { useEffect, useRef, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSession } from '../auth/SessionProvider'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { communityMessage, listCommunities, manage, profile, ranking, rankMembers, saveProfile, type Community, type CommunityProfile, type Member } from './queries'

const field = 'min-h-14 w-full rounded-xl border border-border bg-bg px-3 text-fg'
const lifts = [{ key: 'squat', name: 'スクワット' }, { key: 'bench', name: 'ベンチプレス' }, { key: 'deadlift', name: 'デッドリフト' }] as const
const kg = (n: number | null) => n === null ? '—' : `${n} kg`

export function CommunityPanel() {
  const { userId } = useSession()
  const [groups, setGroups] = useState<Community[]>([])
  const [selected, setSelected] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [person, setPerson] = useState<string | null>(null)
  const [mine, setMine] = useState<CommunityProfile | null>(null)
  const [draft, setDraft] = useState<CommunityProfile | null>(null)
  const [mode, setMode] = useState<'total' | 'growth'>('total')
  const [form, setForm] = useState<'create' | 'join' | null>(null)
  const [value, setValue] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const [loading, setLoading] = useState(true)
  const [rankLoading, setRankLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rankError, setRankError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [rankAttempt, setRankAttempt] = useState(0)
  const [confirm, setConfirm] = useState<'leave' | 'delete' | 'rotate' | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true); setLoadError(null)
    Promise.all([listCommunities(), profile(userId)]).then(([g, p]) => {
      if (!active) return
      setGroups(g); setMine(p); setSelected((id) => g.some((c) => c.id === id) ? id : g[0]?.id ?? '')
    }).catch((e) => { if (active) setLoadError(communityMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, attempt])
  useEffect(() => {
    setMembers([]); setPerson(null); setRankError(null)
    if (!selected) return
    let active = true
    setRankLoading(true)
    ranking(selected).then((data) => { if (active) setMembers(data) })
      .catch((e) => { if (active) setRankError(communityMessage(e)) }).finally(() => { if (active) setRankLoading(false) })
    return () => { active = false }
  }, [selected, rankAttempt])
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(null)
    try { await action() } catch (e) { setError(communityMessage(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  const group = groups.find((g) => g.id === selected)
  const detail = members.find((m) => m.user_id === person)
  if (loading) return <Spinner />
  if (loadError) return <div className="space-y-3"><p role="alert">コミュニティを読み込めませんでした。{loadError}</p><Button onClick={() => setAttempt((n) => n + 1)}>再試行</Button></div>
  return <section className="space-y-5" aria-label="コミュニティ">
    {error && <p role="alert" className="text-sm text-accent">{error}</p>}
    <details open={groups.length === 0} className="rounded-xl border border-border p-3">
      <summary className="flex min-h-14 cursor-pointer items-center text-sm">プロフィール・参加管理</summary>
      <div className="space-y-4">
    {draft ? <form className="space-y-3 rounded-2xl border border-border p-4" onSubmit={(e) => { e.preventDefault(); void run(async () => { await saveProfile(draft); setMine(draft); setDraft(null); setRankAttempt((n) => n + 1) }) }}>
      <h2 className="font-semibold">プロフィール</h2>
      <label className="block text-sm">表示名<input className={field} required maxLength={30} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} disabled={busy} /></label>
      <label className="block text-sm">アイコン<select className={field} value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} disabled={busy}>{['💪','🔥','🏋️','🐻','🐱','⚡'].map((i) => <option key={i}>{i}</option>)}</select></label>
      <label className="block text-sm">ひとこと<input className={field} maxLength={100} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} disabled={busy} /></label>
      <Button disabled={busy || !draft.display_name.trim()} type="submit">{busy ? '保存中…' : 'プロフィールを保存'}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setError(null) }}>キャンセル</Button>
    </form> : <button className="flex min-h-14 w-full items-center justify-between rounded-xl border border-border px-4 text-sm" onClick={() => { setError(null); setDraft(mine ?? { user_id: userId!, display_name: '', icon: '💪', bio: '' }) }}>
      <span>{mine ? `${mine.icon} ${mine.display_name}` : 'プロフィールを作る'}</span><span className="text-xs text-muted">編集</span>
    </button>}
    {!mine && <p className="text-sm text-muted">表示名を設定すると、コミュニティを作成・参加できます。</p>}
    <p className="text-xs leading-relaxed text-muted">参加すると、プロフィールとBIG3の数値・推移をメンバーに共有します。全トレーニング履歴は公開されません。</p>
    <div className="flex gap-2">{(['create','join'] as const).map((f) => <button key={f} disabled={!mine || busy} className="min-h-14 flex-1 rounded-xl border border-border text-sm disabled:opacity-40" onClick={() => { requestId.current = crypto.randomUUID(); setForm(f); setValue(''); setError(null) }}>{f === 'create' ? '＋ コミュニティを作る' : '招待コードで参加'}</button>)}</div>
    {form && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { const id = await manage(form, value.trim(), form === 'create' ? requestId.current : null); setSelected(id); setForm(null); setValue(''); setAttempt((n) => n + 1) }) }}>
      <label className="text-sm">{form === 'create' ? 'コミュニティ名' : '招待コード'}<input className={field} value={value} onChange={(e) => setValue(e.target.value)} required maxLength={form === 'create' ? 40 : 36} disabled={busy} autoCapitalize="none" /></label>
      <Button type="submit" disabled={busy || !value.trim()}>{busy ? '処理中…' : form === 'create' ? '作成する' : '参加する'}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setForm(null); setError(null) }}>キャンセル</Button>
    </form>}
      </div>
    </details>
    {groups.length > 0 && <label className="block text-sm">コミュニティ<select className={field} value={selected} disabled={busy} onChange={(e) => { setSelected(e.target.value); setConfirm(null); setError(null) }}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
    {group && <>
      <div className="flex border-b border-border">{(['total','growth'] as const).map((m) => <button key={m} className={`min-h-14 flex-1 text-sm ${mode === m ? 'border-b-2 border-accent text-fg' : 'text-muted'}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'total' ? 'BIG3合計' : '今月の伸び'}</button>)}</div>
      <p className="text-xs text-muted">{mode === 'total' ? '各種目の最高推定1RMの合計 · 自己申告の記録' : '月初からの自己ベスト合計の増加（日本時間）。月初以前に3種目の記録が必要です。'}</p>
      {rankLoading ? <Spinner /> : rankError ? <div><p role="alert">{rankError}</p><Button variant="ghost" onClick={() => setRankAttempt((n) => n + 1)}>再試行</Button></div> : <div className="divide-y divide-border">{rankMembers(members, mode).map((m) => <button key={m.user_id} onClick={() => setPerson(m.user_id)} className={`flex min-h-20 w-full items-center gap-3 px-2 text-left ${m.user_id === userId ? 'bg-surface' : ''}`}>
        <span className="w-6 text-sm text-muted">{m.rank ?? '—'}</span><span aria-hidden="true">{m.icon}</span><span className="min-w-0 flex-1 break-words text-sm">{m.display_name}{m.user_id === userId && <span className="ml-2 text-xs text-muted">自分</span>}</span>
        <span className="shrink-0 text-lg font-semibold tabular-nums">{mode === 'growth' && m.growth !== null ? '+' : ''}{kg(m[mode])}</span>
      </button>)}</div>}
      {detail && <section className="space-y-4 rounded-2xl border border-border bg-surface p-4" aria-label="メンバーの記録">
        <div className="flex items-center justify-between gap-2"><h2 className="break-words font-semibold">{detail.icon} {detail.display_name}</h2><button className="min-h-14 shrink-0 px-2 text-sm text-muted" onClick={() => setPerson(null)}>閉じる</button></div>
        {detail.bio && <p className="break-words text-sm text-muted">{detail.bio}</p>}
        {lifts.map((l) => <div key={l.key}><div className="flex justify-between text-sm"><span>{l.name}</span><strong>{kg(detail.lifts[l.key])}</strong></div>
          {detail.points.filter((p) => p.lift === l.key).length >= 2 && <div className="mt-3 h-28"><ResponsiveContainer width="100%" height="100%"><LineChart data={detail.points.filter((p) => p.lift === l.key)}><XAxis dataKey="date" tick={{ fill: '#8A8A93', fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} /><YAxis hide domain={['dataMin - 5', 'dataMax + 5']} /><Tooltip contentStyle={{ background: '#17171A', border: '1px solid #2A2A2F' }} formatter={(v) => [`${v} kg`, '推定1RM']} /><Line dataKey="value" stroke="var(--color-accent)" dot={false} /></LineChart></ResponsiveContainer></div>}
        </div>)}
      </section>}
      <p className="text-xs text-muted">— は比較できる記録がまだそろっていない状態です。同じ重量は同順位です。</p>
      {group.invite_code && <details className="rounded-xl border border-border p-3"><summary className="flex min-h-14 cursor-pointer items-center text-sm">招待コード</summary><p className="select-all break-all py-3 font-mono text-sm">{group.invite_code}</p><p className="text-xs text-muted">参加してほしい人にこのコードを送ってください。</p><button disabled={busy} className="min-h-14 text-xs text-muted" onClick={() => setConfirm('rotate')}>コードを再発行</button></details>}
      {confirm ? <div className="space-y-2 rounded-xl border border-border p-4"><p className="text-sm">{confirm === 'delete' ? 'コミュニティを削除しますか？全員がランキングを見られなくなります。筋トレ記録は残ります。' : confirm === 'rotate' ? '招待コードを再発行しますか？古いコードは使えなくなります。' : 'コミュニティから退出しますか？プロフィールとBIG3の共有も終了します。'}</p><Button disabled={busy} onClick={() => void run(async () => { await manage(confirm, '', selected); setConfirm(null); setAttempt((n) => n + 1) })}>確定する</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>キャンセル</Button></div> : <button disabled={busy} className="min-h-14 text-xs text-muted" onClick={() => setConfirm(group.owner_id === userId ? 'delete' : 'leave')}>{group.owner_id === userId ? 'コミュニティを削除' : 'コミュニティから退出'}</button>}
    </>}
  </section>
}
