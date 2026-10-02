import { useCallback, useEffect, useMemo, useState } from 'react'
import { SwipeRow } from '../../components/SwipeRow'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { movingAverage, parseBodyFat, withinPeriod, type BodyMetric } from '../../lib/bodyComposition'
import type { BodyweightLog } from '../../lib/bodyweight'
import { toMessage } from '../../lib/errors'
import { useSession } from '../auth/SessionProvider'
import { deleteBodyLog, fetchBodyweightLogs, parseBodyweight, saveBodyComposition } from '../profile/bodyweightQueries'

import { HealthSyncPanel } from './HealthSyncPanel'
import { BodyTrendChart } from './BodyTrendChart'

const field = 'min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg tabular-nums'
const METRICS: { key: BodyMetric; label: string; unit: string }[] = [
  { key: 'bodyweight_kg', label: '体重', unit: 'kg' },
  { key: 'body_fat_pct', label: '体脂肪率', unit: '%' },
]
const PERIODS: { months: number | null; label: string }[] = [
  { months: 1, label: '1ヶ月' }, { months: 3, label: '3ヶ月' }, { months: 12, label: '1年' }, { months: null, label: '全期間' },
]

export function BodyPage() {
  const { userId } = useSession()
  // アカウントが変わったら入力・履歴・進行中の操作を新しい画面に引き継がない。
  return userId ? <OwnedBodyPage key={userId} userId={userId} /> : null
}

function OwnedBodyPage({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<BodyweightLog[]>([])
  const [weight, setWeight] = useState('')
  const [fat, setFat] = useState('')
  const [metric, setMetric] = useState<BodyMetric>('bodyweight_kg')
  const [months, setMonths] = useState<number | null>(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  // null は今日の記録。過去の日をタップするとその日を直す
  const [editing, setEditing] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [listLimit, setListLimit] = useState(50)
  const [healthBusy, setHealthBusy] = useState(false)

  function prefill(rows: BodyweightLog[]) {
    const latest = rows.at(-1)
    setWeight(latest ? String(latest.bodyweight_kg) : '')
    setFat(latest?.body_fat_pct == null ? '' : String(latest.body_fat_pct))
  }

  const load = useCallback(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setLoadError(null)
    setError(null)
    setEditing(null)
    setSaved(false)
    fetchBodyweightLogs(userId)
      .then((rows) => {
        if (!active) return
        setLogs(rows)
        setListLimit(50)
        // 直近の値で今日の入力を初期表示する
        prefill(rows)
      })
      .catch((e) => { if (active) setLoadError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])
  useEffect(() => load(), [load, attempt])

  async function save() {
    if (!userId || busy) return
    const bodyweightKg = parseBodyweight(weight)
    if (bodyweightKg === null) { setError('体重は20〜300kgで入力してください'); return }
    const bodyFatPct = fat.trim() ? parseBodyFat(fat) : null
    if (fat.trim() && bodyFatPct === null) { setError('体脂肪率は1〜70%で入力してください'); return }
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const row = await saveBodyComposition(userId, editing ? { date: editing, bodyweightKg, bodyFatPct } : { bodyweightKg, bodyFatPct })
      const updated = [...logs.filter((l) => l.recorded_on !== row.recorded_on), row]
        .sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
      setLogs(updated)
      prefill(updated)
      setEditing(null)
      setSaved(true)
    } catch (e) { setError(toMessage(e)) }
    finally { setBusy(false) }
  }

  async function remove(recordedOn: string) {
    if (!userId || deleting) return
    setDeleting(recordedOn)
    setError(null)
    try {
      await deleteBodyLog(userId, recordedOn)
      const updated = logs.filter((l) => l.recorded_on !== recordedOn)
      setLogs(updated)
      setSaved(false)
      if (editing === null || editing === recordedOn) {
        setEditing(null)
        prefill(updated)
      }
    } catch (e) { setError(toMessage(e)) }
    finally { setDeleting(null) }
  }

  const visible = useMemo(() => months === null ? logs : withinPeriod(logs, months), [logs, months])
  // 表示期間より前の記録も、境界日の7日平均に含める。
  const points = useMemo(() => {
    const visibleDates = new Set(visible.map((row) => row.recorded_on))
    return movingAverage(logs, metric).filter((point) => visibleDates.has(point.date))
  }, [logs, metric, visible])
  const unit = METRICS.find((m) => m.key === metric)!.unit

  return <div className="flex flex-col gap-5 p-4">
    <h1 className="text-2xl font-semibold">体組成</h1>
    <Button variant="ghost" disabled={loading || busy || deleting !== null || healthBusy} onClick={() => setAttempt((value) => value + 1)}>
      {loading ? '読み込み中…' : '記録を再読み込み'}
    </Button>
    <HealthSyncPanel userId={userId} refreshVersion={attempt} onBusyChange={setHealthBusy} />

    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-label="記録の入力">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{editing ?? '今日'}の記録</h2>
        {editing && <button type="button" className="min-h-14 text-sm text-muted" disabled={busy || loading || loadError !== null || deleting !== null}
          onClick={() => { setEditing(null); prefill(logs); setError(null); setSaved(false) }}>今日に戻る</button>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2 text-sm text-muted">体重（kg）
          <input type="number" inputMode="decimal" min="20" max="300" step="0.1" value={weight} disabled={busy || loading || loadError !== null || deleting !== null}
            onChange={(e) => { setWeight(e.target.value); setSaved(false); setError(null) }} className={field} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">体脂肪率（%）
          <input type="number" inputMode="decimal" min="1" max="70" step="0.1" value={fat} disabled={busy || loading || loadError !== null || deleting !== null}
            onChange={(e) => { setFat(e.target.value); setSaved(false); setError(null) }} className={field} />
        </label>
      </div>
      <p className="text-xs text-muted">体脂肪率は任意です。同じ日に入れ直すと上書きされます。</p>
      {loadError && <p role="alert" className="text-sm text-accent">{loadError}</p>}
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button onClick={() => void save()} disabled={busy || loading || loadError !== null || deleting !== null || !weight.trim()}>{busy ? '保存中…' : '記録する'}</Button>
      {saved && <p role="status" className="text-sm">記録しました</p>}
    </section>

    <section className="flex flex-col gap-3" aria-label="推移">
      <div className="flex border-b border-border">
        {METRICS.map((m) => <button key={m.key} type="button" aria-pressed={metric === m.key}
          className={`min-h-14 flex-1 text-sm ${metric === m.key ? 'border-b-2 border-accent text-fg' : 'text-muted'}`}
          onClick={() => setMetric(m.key)}>{m.label}</button>)}
      </div>
      <div className="flex gap-2">
        {PERIODS.map((p) => <button key={p.months ?? 'all'} type="button" aria-pressed={months === p.months}
          className={`min-h-14 flex-1 rounded-xl border text-sm ${months === p.months ? 'border-accent text-fg' : 'border-border text-muted'}`}
          onClick={() => { setMonths(p.months); setListLimit(50) }}>{p.label}</button>)}
      </div>
      {loading ? <Spinner /> : loadError ? null : points.length === 0
        ? <p className="py-8 text-center text-sm text-muted">この期間の記録はありません</p>
        : <BodyTrendChart points={points} unit={unit} showYear={months === null} />}
      <p className="text-xs text-muted">細い線がその日の記録、太い線が7日移動平均です。体重は日々ぶれるので、増減は太い線で読みます。</p>
    </section>

    <section className="flex flex-col gap-2" aria-label="最近の記録">
      <h2 className="text-sm font-semibold">最近の記録</h2>
      {loading ? <Spinner /> : loadError ? null : visible.length === 0 ? <p className="py-4 text-center text-sm text-muted">まだ記録がありません</p>
        : <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
            {[...visible].reverse().slice(0, listLimit).map((l) => <SwipeRow key={l.recorded_on} label={`${l.recorded_on} の記録を削除`}
              disabled={busy || deleting !== null} deleting={deleting === l.recorded_on} onDelete={() => remove(l.recorded_on)}>
              <button type="button" aria-label={`${l.recorded_on} の記録を修正`} disabled={busy || loading || loadError !== null || deleting !== null}
                className="flex min-h-14 flex-1 items-center justify-between gap-2 text-left"
                onClick={() => {
                  setEditing(l.recorded_on)
                  setWeight(String(l.bodyweight_kg))
                  setFat(l.body_fat_pct === null || l.body_fat_pct === undefined ? '' : String(l.body_fat_pct))
                  setError(null)
                  setSaved(false)
                }}>
                <span className="text-sm text-muted">{l.recorded_on}</span>
                <span className="text-lg font-semibold tabular-nums">{l.bodyweight_kg}<span className="text-xs font-normal text-muted"> kg</span>
                  {l.body_fat_pct !== null && l.body_fat_pct !== undefined && <>
                    <span className="ml-2">{l.body_fat_pct}</span><span className="text-xs font-normal text-muted"> %</span></>}</span>
              </button>
            </SwipeRow>)}
          </ul>}
      {!loading && !loadError && visible.length > listLimit && <Button variant="ghost" onClick={() => setListLimit((value) => value + 50)}>さらに50件表示</Button>}
      {!loading && !loadError && visible.length > 0 && <p className="text-xs text-muted">{Math.min(listLimit, visible.length)} / {visible.length}件を表示</p>}
      <p className="text-center text-xs text-muted">タップで修正、左にスワイプで削除</p>
    </section>

    {!loading && loadError && <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>再試行</Button>}
  </div>
}
