import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { toMessage } from '../../lib/errors'
import { useSession } from '../auth/SessionProvider'
import {
  createStrengthGoal,
  deleteStrengthGoal,
  fetchStrengthGoals,
  fetchStrengthSnapshot,
  type LiftSnapshot,
  type StrengthGoal,
  type StrengthSnapshot,
} from './queries'

function formatKg(value: number | null): string {
  if (value === null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

function LiftCard({ lift }: { lift: LiftSnapshot }) {
  const content = (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{lift.label}</h2>
        {lift.exerciseId && <span className="text-xs text-muted">詳細 →</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="1RM PR" value={formatKg(lift.pr1rm)} />
        <Metric label="30日 e1RM" value={formatKg(lift.currentE1rm)} />
        <Metric label="最高 e1RM" value={formatKg(lift.allTimeE1rm)} />
      </div>
    </div>
  )

  if (!lift.exerciseId) return content
  return <Link to={`/exercises/${lift.exerciseId}`}>{content}</Link>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">
        {value}
        {value !== '—' && <span className="ml-1 text-xs font-normal text-muted">kg</span>}
      </div>
    </div>
  )
}

export function StrengthPage() {
  const { userId } = useSession()
  const { show } = useToast()
  const [snapshot, setSnapshot] = useState<StrengthSnapshot | null>(null)
  const [goals, setGoals] = useState<StrengthGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [label, setLabel] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [targetTotal, setTargetTotal] = useState('')

  const load = useCallback(() => {
    if (!userId) return
    setLoading(true)
    setError(null)
    Promise.all([fetchStrengthSnapshot(userId), fetchStrengthGoals(userId)])
      .then(([nextSnapshot, nextGoals]) => {
        setSnapshot(nextSnapshot)
        setGoals(nextGoals)
      })
      .catch((e: unknown) => {
        const message = toMessage(e)
        setError(message)
        show(message)
      })
      .finally(() => setLoading(false))
  }, [userId, show])

  useEffect(() => {
    load()
  }, [load])

  const nextGoal = useMemo(() => {
    if (goals.length === 0) return null
    const current = snapshot?.prTotal ?? 0
    return goals.find((goal) => goal.target_total_kg > current) ?? goals[goals.length - 1]
  }, [goals, snapshot])

  async function handleAddGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return

    const total = Number(targetTotal)
    if (!label.trim() || !targetDate || !Number.isFinite(total) || total <= 0) {
      show('ラベル・期限・Total目標を入力してください')
      return
    }

    setSaving(true)
    try {
      const created = await createStrengthGoal({
        userId,
        label,
        targetDate,
        targetTotalKg: total,
      })
      setGoals((current) => [...current, created].sort((a, b) => a.target_date.localeCompare(b.target_date)))
      setLabel('')
      setTargetDate('')
      setTargetTotal('')
    } catch (e) {
      show(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteGoal(goalId: string) {
    try {
      await deleteStrengthGoal(goalId)
      setGoals((current) => current.filter((goal) => goal.id !== goalId))
    } catch (e) {
      show(toMessage(e))
    }
  }

  if (loading) return <Spinner />

  if (error || !snapshot) {
    return (
      <div className="flex flex-col gap-3 p-4 py-8">
        <p role="alert" className="text-center text-sm text-muted">
          {error ?? 'Big3データを取得できませんでした'}
        </p>
        <Button variant="ghost" onClick={load}>
          再試行
        </Button>
      </div>
    )
  }

  const currentForProgress = snapshot.prTotal ?? 0
  const progress = nextGoal
    ? Math.min(100, Math.max(0, (currentForProgress / nextGoal.target_total_kg) * 100))
    : 0
  const remaining = nextGoal && snapshot.prTotal !== null
    ? Math.max(0, nextGoal.target_total_kg - snapshot.prTotal)
    : null

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Strength</p>
        <h1 className="mt-1 text-2xl font-bold">Big3 Dashboard</h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">PR Total</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {formatKg(snapshot.prTotal)}
            {snapshot.prTotal !== null && <span className="ml-1 text-sm font-normal text-muted">kg</span>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">30日 推定Total</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {formatKg(snapshot.currentEstimatedTotal)}
            {snapshot.currentEstimatedTotal !== null && (
              <span className="ml-1 text-sm font-normal text-muted">kg</span>
            )}
          </div>
        </div>
      </section>

      {nextGoal && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted">次の目標</div>
              <div className="mt-1 text-lg font-semibold">{nextGoal.label}</div>
              <div className="text-xs text-muted">{formatDate(nextGoal.target_date)}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{formatKg(nextGoal.target_total_kg)}</div>
              <div className="text-xs text-muted">kg Total</div>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-right text-xs text-muted">
            {remaining === null ? '3種目の1RMシングルを記録すると進捗が表示されます' : `あと ${formatKg(remaining)} kg`}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <LiftCard lift={snapshot.lifts.squat} />
        <LiftCard lift={snapshot.lifts.bench} />
        <LiftCard lift={snapshot.lifts.deadlift} />
      </section>

      <p className="text-xs leading-relaxed text-muted">
        e1RMは1〜10回のセットをBrzycki式で換算した成長トレンド用の指標です。
        実際にその重量が1回挙がることを保証する値ではありません。
      </p>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Total目標</h2>
        {goals.length === 0 ? (
          <p className="mb-4 text-sm text-muted">まだ目標がありません。</p>
        ) : (
          <div className="mb-4 flex flex-col gap-2">
            {goals.map((goal) => (
              <div key={goal.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3">
                <div>
                  <div className="font-medium">{goal.label}</div>
                  <div className="text-xs text-muted">
                    {formatDate(goal.target_date)} · {formatKg(goal.target_total_kg)} kg
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteGoal(goal.id)}
                  className="min-h-14 px-3 text-sm text-muted"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(event) => void handleAddGoal(event)} className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 font-medium">目標を追加</h3>
          <div className="flex flex-col gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">ラベル</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="年内 / 半年 / 1年"
                maxLength={40}
                className="min-h-12 w-full rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">期限</span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  className="min-h-12 w-full rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">Total</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.5"
                  value={targetTotal}
                  onChange={(event) => setTargetTotal(event.target.value)}
                  placeholder="500"
                  className="min-h-12 w-full rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
                />
              </label>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : '目標を追加'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
