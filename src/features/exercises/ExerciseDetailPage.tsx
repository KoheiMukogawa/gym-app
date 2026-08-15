import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { maxWeightByDate, personalBest, totalVolume } from '../../lib/calc'
import { toMessage } from '../../lib/errors'
import { MUSCLE_GROUP_LABELS, type Exercise, type SetWithDate } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { useSession } from '../auth/SessionProvider'
import { fetchExercise, fetchExerciseSets } from './queries'

export type ExerciseSummary = {
  best: number | null
  volume: number
  setCount: number
  points: { date: string; max_weight: number }[]
}

export function summarizeExercise(sets: SetWithDate[]): ExerciseSummary {
  return {
    best: personalBest(sets),
    volume: totalVolume(sets),
    setCount: sets.length,
    points: maxWeightByDate(sets),
  }
}

export function ExerciseDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { userId } = useSession()
  const { show } = useToast()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [sets, setSets] = useState<SetWithDate[]>([])
  const [loading, setLoading] = useState(true)
  // トーストは6秒で自然消滅するため、消えた後も画面に残る「取得失敗」の
  // 事実を exercise とは別に持つ。これが無いと、失敗時に exercise が null のままで
  // 「この種目は存在しない」という誤った表示になってしまう。
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!exerciseId || !userId) return
    setLoading(true)
    setError(null)
    Promise.all([fetchExercise(exerciseId), fetchExerciseSets(exerciseId, userId)])
      .then(([ex, s]) => {
        setExercise(ex)
        setSets(s)
      })
      .catch((e: unknown) => {
        const message = toMessage(e)
        setError(message)
        show(message)
      })
      .finally(() => setLoading(false))
  }, [exerciseId, userId, show])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Spinner />

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4 py-8">
        <p role="alert" className="text-center text-sm text-muted">
          {error}
        </p>
        <Button variant="ghost" onClick={load}>
          再試行
        </Button>
      </div>
    )
  }

  if (!exercise) return <p className="p-4 text-sm text-muted">種目が見つかりませんでした</p>

  const summary = summarizeExercise(sets)

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <Link to="/" className="text-xs text-muted">
          ← ホーム
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{exercise.name}</h1>
        <p className="text-xs text-muted">{MUSCLE_GROUP_LABELS[exercise.muscle_group]}</p>
      </header>

      <section className="grid grid-cols-3 gap-2">
        <Stat label="自己ベスト" value={summary.best === null ? '—' : `${summary.best}`} unit="kg" />
        <Stat label="総ボリューム" value={summary.volume.toLocaleString('en-US')} unit="kg" />
        <Stat label="総セット数" value={String(summary.setCount)} unit="セット" />
      </section>

      <section>
        <h2 className="mb-3 text-sm text-muted">重量の推移（日ごとの最大）</h2>
        {summary.points.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">まだ記録がありません</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#2A2A2F" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8A8A93', fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5).replace('-', '/')}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8A8A93', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: '#17171A',
                    border: '1px solid #2A2A2F',
                    borderRadius: 12,
                    color: '#F5F5F5',
                  }}
                  formatter={(v) => [`${v} kg`, '最大重量']}
                />
                <Line
                  type="monotone"
                  dataKey="max_weight"
                  stroke="#E8412F"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#E8412F' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{unit}</div>
    </div>
  )
}
