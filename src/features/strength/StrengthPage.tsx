import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { toMessage } from '../../lib/errors'
import { currentGoal, saveCurrentGoal } from './currentGoal'
import { StrengthScore } from './StrengthScore'
import { useSession } from '../auth/SessionProvider'
import {
  fetchStrengthGoals,
  fetchStrengthSnapshot,
  type StrengthGoal,
  type StrengthSnapshot,
} from './queries'
import { LiftCard } from './LiftCard'

type LiftKey = 'squat' | 'bench' | 'deadlift'
const LIFT_FIELDS: [LiftKey, string][] = [['squat', 'スクワット'], ['bench', 'ベンチ'], ['deadlift', 'デッド']]

export function StrengthPage() {
  const { userId } = useSession()
  const { show } = useToast()
  const [snapshot, setSnapshot] = useState<StrengthSnapshot | null>(null)
  const [goal, setGoal] = useState<StrengthGoal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [targetDate, setTargetDate] = useState('')
  const [targetTotal, setTargetTotal] = useState('')
  // 種目別の目標（任意）。空欄は設定しない
  const [liftTexts, setLiftTexts] = useState<Record<LiftKey, string>>({ squat: '', bench: '', deadlift: '' })
  const saveLock = useRef(false)
  const load = useCallback(() => {
    if (!userId) return
    setLoading(true); setError(null)
    Promise.all([fetchStrengthSnapshot(userId), fetchStrengthGoals(userId)])
      .then(([nextSnapshot, goals]) => { setSnapshot(nextSnapshot); setGoal(currentGoal(goals)) })
      .catch((e: unknown) => setError(toMessage(e)))
      .finally(() => setLoading(false))
  }, [userId])
  useEffect(() => { load() }, [load])
  function edit() {
    setTargetDate(goal?.target_date ?? '')
    setTargetTotal(goal ? String(goal.target_total_kg) : '')
    const text = (value: number | null | undefined) => (value == null ? '' : String(value))
    setLiftTexts({ squat: text(goal?.target_squat_kg), bench: text(goal?.target_bench_kg), deadlift: text(goal?.target_deadlift_kg) })
    setSaveError(null); setEditing(true)
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || saveLock.current) return
    saveLock.current = true; setSaving(true); setSaveError(null)
    try {
      const lift = (key: LiftKey) => (liftTexts[key].trim() === '' ? null : Number(liftTexts[key]))
      const saved = await saveCurrentGoal({ userId, existing: goal, targetDate, targetTotalKg: Number(targetTotal),
        liftTargets: { squat: lift('squat'), bench: lift('bench'), deadlift: lift('deadlift') } })
      setGoal(saved); setEditing(false); show('目標を保存しました')
    } catch (e) { setSaveError(toMessage(e)) }
    finally { saveLock.current = false; setSaving(false) }
  }
  if (loading) return <Spinner />
  if (error || !snapshot) return <div className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{error ?? 'Big3データを取得できませんでした'}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </div>
  return <div className="flex flex-col gap-6 p-4">
    <header><h1 className="text-2xl font-bold">BIG3</h1></header>
    {editing ? <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="mb-5 text-lg font-semibold">{goal ? '目標を変更' : '目標を設定'}</h2>
      <form onSubmit={(event) => void save(event)} className="space-y-5">
        <label className="flex flex-col gap-2 text-sm text-muted">目標の合計重量（kg）
          <input type="number" inputMode="decimal" min="0.1" max="9999.9" step="0.1" required
            value={targetTotal} disabled={saving} onChange={(e) => setTargetTotal(e.target.value)} placeholder="500"
            className="min-h-14 w-full min-w-0 rounded-xl border border-border bg-bg px-4 text-2xl text-fg" />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted">種目別の目標（任意・推定1RM kg）</legend>
          <p className="text-xs text-muted">入れた種目は、ホームの種目別の棒グラフが目標までの進み具合になります。</p>
          <div className="grid grid-cols-3 gap-2">
            {LIFT_FIELDS.map(([key, label]) => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-muted">{label}
              <input type="number" inputMode="decimal" min="0.1" max="9999.9" step="0.1" value={liftTexts[key]} disabled={saving}
                onChange={(e) => setLiftTexts((old) => ({ ...old, [key]: e.target.value }))} placeholder="—"
                className="min-h-14 w-full min-w-0 rounded-xl border border-border bg-bg px-3 text-lg text-fg" />
            </label>)}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm text-muted">目標期限
          <input type="date" required value={targetDate} disabled={saving} onChange={(e) => setTargetDate(e.target.value)}
            className="min-h-14 w-full min-w-0 rounded-xl border border-border bg-bg px-4 text-fg" />
        </label>
        {saveError && <p role="alert" className="text-sm text-accent">{saveError}</p>}
        <Button type="submit" disabled={saving}>{saving ? '保存中…' : '目標を保存'}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>キャンセル</Button>
      </form>
    </section> : <StrengthScore snapshot={snapshot} goal={goal} onEdit={edit} />}
    <section className="flex flex-col gap-3" aria-label="種目ごとの記録">
      <h2 className="text-sm font-semibold">種目ごとの記録</h2>
      <LiftCard key={`squat:${snapshot.lifts.squat.exerciseId}`} lift={snapshot.lifts.squat} />
      <LiftCard key={`bench:${snapshot.lifts.bench.exerciseId}`} lift={snapshot.lifts.bench} />
      <LiftCard key={`deadlift:${snapshot.lifts.deadlift.exerciseId}`} lift={snapshot.lifts.deadlift} />
    </section>
    <p className="text-xs leading-relaxed text-muted">e1RMは1〜10回のセットをBrzycki式で換算した推定値です。実際にその重量を1回挙げられることを保証する値ではありません。</p>
  </div>
}
