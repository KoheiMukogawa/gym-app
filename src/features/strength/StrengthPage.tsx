import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { toMessage } from '../../lib/errors'
import { currentGoal, saveCurrentGoal } from './currentGoal'
import { StrengthScore } from './StrengthScore'
import { useSession } from '../auth/SessionProvider'
import { ChartDatePicker, ExerciseDayDetails } from '../exercises/ExerciseDayDetails'
import {
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



function LiftCard({ lift }: { lift: LiftSnapshot }) {
  const [selectedDate, setSelectedDate] = useState('')
  const content = (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0">
          {lift.exerciseId ? <Link to={`/exercises/${lift.exerciseId}`} className="flex min-h-14 items-center gap-3"><h2 className="font-semibold">{lift.label}</h2><span className="text-xs text-muted">詳細 →</span></Link> : <h2 className="font-semibold">{lift.label}</h2>}
          <p className="break-words text-xs text-muted">{lift.exerciseName ?? '対象種目が見つかりません'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="1回の最高重量" value={formatKg(lift.pr1rm)} />
        <Metric label="最近の推定MAX" value={formatKg(lift.currentE1rm)} />
        <Metric label="推定MAXの最高" value={formatKg(lift.allTimeE1rm)} />
      </div>

      {lift.e1rmPoints.length >= 1 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-xs text-muted">e1RMの推移</div>
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lift.e1rmPoints} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} onClick={state => { const date = String(state?.activeLabel ?? ''); if (lift.e1rmPoints.some(p => p.date === date)) setSelectedDate(date) }}>
                {selectedDate && <ReferenceLine x={selectedDate} stroke="#E8412F" strokeDasharray="3 3" />}
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8A8A93', fontSize: 10 }}
                  tickFormatter={(date: string) => date.slice(5).replace('-', '/')}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: '#8A8A93', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  domain={['dataMin - 5', 'dataMax + 5']}
                />
                <Tooltip
                  contentStyle={{
                    background: '#17171A',
                    border: '1px solid #2A2A2F',
                    borderRadius: 12,
                    color: '#F5F5F5',
                  }}
                  formatter={(value) => [`${value} kg`, 'e1RM']}
                  labelFormatter={(date) => String(date)}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  stroke="#E8412F"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ChartDatePicker dates={lift.e1rmPoints.map(p => p.date)} value={selectedDate} onChange={setSelectedDate} />
          {selectedDate && lift.exerciseId && <ExerciseDayDetails key={`${lift.exerciseId}:${selectedDate}`} exerciseId={lift.exerciseId} date={selectedDate} />}
        </div>
      )}
    </div>
  )

  return content
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
  const [goal, setGoal] = useState<StrengthGoal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [targetDate, setTargetDate] = useState('')
  const [targetTotal, setTargetTotal] = useState('')
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
    setSaveError(null); setEditing(true)
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || saveLock.current) return
    saveLock.current = true; setSaving(true); setSaveError(null)
    try {
      const saved = await saveCurrentGoal({ userId, existing: goal, targetDate, targetTotalKg: Number(targetTotal) })
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
