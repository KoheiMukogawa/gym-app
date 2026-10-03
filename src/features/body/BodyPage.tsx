import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { FloatingRecordAction } from '../../components/ui/FloatingRecordAction'
import { Spinner } from '../../components/ui/Spinner'
import { combineTrends, latestSummary, parseBodyFat, withinPeriod } from '../../lib/bodyComposition'
import type { BodyweightLog } from '../../lib/bodyweight'
import { toMessage } from '../../lib/errors'
import { useSession } from '../auth/SessionProvider'
import { deleteBodyLog, fetchBodyweightLogs, parseBodyweight, saveBodyComposition } from '../profile/bodyweightQueries'

import { HealthSyncPanel } from './HealthSyncPanel'
import { BodyTrendChart, FAT_COLOR, WEIGHT_COLOR } from './BodyTrendChart'

const field = 'min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg tabular-nums'
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
  const [months, setMonths] = useState<number | null>(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  // null は今日の記録。過去の日をタップするとその日を直す
  const [editing, setEditing] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [healthBusy, setHealthBusy] = useState(false)
  const weightInput = useRef<HTMLInputElement>(null)
  const entryTrigger = useRef<HTMLButtonElement>(null)

  function finishEntry() {
    setEntryOpen(false)
    setConfirming(false)
    requestAnimationFrame(() => entryTrigger.current?.focus({ preventScroll: true }))
  }

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
    setNotice(null)
    setEntryOpen(false)
    setConfirming(false)
    fetchBodyweightLogs(userId)
      .then((rows) => {
        if (!active) return
        setLogs(rows)
        // 直近の値で今日の入力を初期表示する
        prefill(rows)
      })
      .catch((e) => { if (active) setLoadError(toMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])
  useEffect(() => load(), [load, attempt])

  async function save() {
    if (!userId || busy || loading || loadError !== null || deleting !== null || confirming) return
    const bodyweightKg = parseBodyweight(weight)
    if (bodyweightKg === null) { setError('体重は20〜300kgで入力してください'); return }
    const bodyFatPct = fat.trim() ? parseBodyFat(fat) : null
    if (fat.trim() && bodyFatPct === null) { setError('体脂肪率は1〜70%で入力してください'); return }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const row = await saveBodyComposition(userId, editing ? { date: editing, bodyweightKg, bodyFatPct } : { bodyweightKg, bodyFatPct })
      const updated = [...logs.filter((l) => l.recorded_on !== row.recorded_on), row]
        .sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
      setLogs(updated)
      prefill(updated)
      setEditing(null)
      setConfirming(false)
      setNotice('記録しました')
      finishEntry()
    } catch (e) { setError(toMessage(e)) }
    finally { setBusy(false) }
  }

  async function remove(recordedOn: string) {
    if (!userId || deleting || busy || loading || loadError !== null || !confirming) return
    setDeleting(recordedOn)
    setError(null)
    try {
      await deleteBodyLog(userId, recordedOn)
      const updated = logs.filter((l) => l.recorded_on !== recordedOn)
      setLogs(updated)
      setNotice('記録を削除しました')
      setConfirming(false)
      if (editing === null || editing === recordedOn) {
        setEditing(null)
        prefill(updated)
      }
      finishEntry()
    } catch (e) { setError(toMessage(e)) }
    finally { setDeleting(null) }
  }

  const visible = useMemo(() => months === null ? logs : withinPeriod(logs, months), [logs, months])
  // 表示期間より前の記録も、境界日の7日平均に含める。
  const points = useMemo(() => {
    const visibleDates = new Set(visible.map((row) => row.recorded_on))
    return combineTrends(logs).filter((point) => visibleDates.has(point.date))
  }, [logs, visible])
  const latest = useMemo(() => latestSummary(logs), [logs])
  const today = new Date().toLocaleDateString('sv-SE')
  const target = editing ?? today
  const targetExists = logs.some((l) => l.recorded_on === target)
  const locked = busy || loading || loadError !== null || deleting !== null

  // A tap on the chart opens that day in the form. The ref keeps the callback stable for the memoized chart.
  const selectDay = useRef<(date: string) => void>(() => {})
  selectDay.current = (date: string) => {
    const row = logs.find((l) => l.recorded_on === date)
    if (!row || locked) return
    setEditing(date)
    setWeight(String(row.bodyweight_kg))
    setFat(row.body_fat_pct === null || row.body_fat_pct === undefined ? '' : String(row.body_fat_pct))
    setError(null)
    setNotice(null)
    setConfirming(false)
    setEntryOpen(true)
  }
  const onSelectDay = useCallback((date: string) => selectDay.current(date), [])

  function openTodayEntry() {
    if (locked) return
    setEditing(null)
    prefill(logs)
    setError(null)
    setNotice(null)
    setConfirming(false)
    setEntryOpen(true)
  }

  function dismissEntry() {
    if (busy || deleting !== null) return
    setError(null)
    finishEntry()
  }

  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 pb-20">
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">体組成</h1>
      <button type="button" aria-label="記録を再読み込み" title="記録を再読み込み"
        disabled={loading || busy || deleting !== null || healthBusy}
        onClick={() => setAttempt((value) => value + 1)}
        className="flex min-h-14 min-w-14 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg disabled:opacity-40">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
          className={`h-5 w-5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" />
        </svg>
      </button>
    </header>

    <section className="flex flex-col gap-3" aria-label="推移">
      {/* The period picker shares the heading row; each button keeps a 56px tap height. */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">推移</h2>
        <div className="flex" role="group" aria-label="表示期間">
          {PERIODS.map((p) => <button key={p.months ?? 'all'} type="button" aria-pressed={months === p.months}
            className="flex min-h-14 items-center px-1 text-sm" onClick={() => setMonths(p.months)}>
            <span className={`rounded-full px-2.5 py-1 ${months === p.months ? 'bg-border font-semibold text-fg' : 'text-muted'}`}>{p.label}</span>
          </button>)}
        </div>
      </div>
      {/* The legend carries the latest values, so no separate card repeats the two metrics. */}
      <section aria-label="最新の記録" className="flex flex-col gap-2">
        <p className="text-xs text-muted tabular-nums">
          {!loading && !loadError && latest ? <>最新 <time dateTime={latest.date}>{latest.date.slice(5).replace('-', '/')}</time></> : '最新の記録'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <LatestValue label="体重" unit="kg" axis="左の目盛り" color={WEIGHT_COLOR} value={loading || loadError ? null : latest?.weight ?? null}
            change={latest?.weightChange ?? null} pending={loading} />
          <LatestValue label="体脂肪率" unit="%" axis="右の目盛り" color={FAT_COLOR} value={loading || loadError ? null : latest?.fat ?? null}
            change={latest?.fatChange ?? null} pending={loading} />
        </div>
      </section>
      {loading ? <Spinner /> : loadError ? null : points.length === 0
        ? <p className="py-8 text-center text-sm text-muted">この期間の記録はありません</p>
        : <BodyTrendChart points={points} showYear={months === null} onSelectDay={onSelectDay} />}
      <p className="text-xs text-muted">点はその日の記録、線は7日平均。</p>
      <p className="text-xs text-muted">グラフをタップすると、その日の記録を修正・削除できます。</p>
    </section>

    {notice && <p role="status" className="text-sm">{notice}</p>}
    <HealthSyncPanel userId={userId} refreshVersion={attempt} onBusyChange={setHealthBusy} />

    {!loading && loadError && <div className="space-y-3">
      <p role="alert" className="text-sm text-accent">{loadError}</p>
      <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>再試行</Button>
    </div>}
    {entryOpen ? <BottomSheet title={editing ? editing.slice(5).replace('-', '/') + 'の記録' : '今日の記録'}
      description={target} initialFocusRef={weightInput} dismissible={!busy && deleting === null} onDismiss={dismissEntry}>
      <form aria-label="記録の入力" noValidate onSubmit={(event) => { event.preventDefault(); void save() }} className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm text-muted">体重（kg）
              <input ref={weightInput} type="number" inputMode="decimal" min="20" max="300" step="0.1" value={weight} disabled={locked}
                onChange={(event) => { setWeight(event.target.value); setError(null) }} className={field} />
            </label>
            <label className="flex flex-col gap-2 text-sm text-muted">体脂肪率（%）
              <input type="number" inputMode="decimal" min="1" max="70" step="0.1" value={fat} disabled={locked}
                onChange={(event) => { setFat(event.target.value); setError(null) }} className={field} />
            </label>
          </div>
          <p className="text-xs text-muted">体脂肪率は任意。同じ日付の記録は更新されます。</p>
        </div>
        <footer className="flex shrink-0 flex-col gap-3 border-t border-border px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && <p role="alert" className="text-sm text-accent">{error}</p>}
          {confirming ? <>
            <p className="text-sm text-muted">{target} の記録を削除しますか？</p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" disabled={locked} onClick={() => void remove(target)}>{deleting ? '削除中…' : '削除する'}</Button>
              <Button variant="ghost" className="flex-1" disabled={locked} onClick={() => { setConfirming(false); setError(null) }}>やめる</Button>
            </div>
          </> : <>
            <Button type="submit" disabled={locked || !weight.trim()}>{busy ? '保存中…' : '記録する'}</Button>
            {targetExists && <button type="button" aria-label={`${target} の記録を削除`} className="min-h-14 text-sm text-muted disabled:opacity-40"
              disabled={locked} onClick={() => { setConfirming(true); setError(null) }}>この日の記録を削除</button>}
          </>}
        </footer>
      </form>
    </BottomSheet> : <FloatingRecordAction label="体重を記録" buttonRef={entryTrigger} onClick={openTodayEntry} disabled={locked} />}
  </div>
}

const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '-' : '±'}${Math.abs(value).toFixed(1)}`

/** One column of the latest-record row. The aria-label reads value and change together. */
function LatestValue({ label, unit, axis, color, value, change, pending }: {
  label: string; unit: string; axis: string; color: string; value: number | null; change: number | null; pending: boolean
}) {
  const spoken = value === null ? `${label} 未記録` : `${label} ${value}${unit}、前回比${change === null ? 'なし' : ` ${signed(change)}${unit}`}`
  return <div role="group" aria-label={pending ? `${label} 読み込み中` : spoken} className="min-w-0">
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} /><span>{label}・{axis}</span>
    </p>
    <p className="text-2xl font-semibold tracking-tight tabular-nums">
      {pending ? '…' : value === null ? <span className="text-muted">—</span> : <>{value}<span className="ml-0.5 text-xs font-normal text-muted">{unit}</span></>}
    </p>
    <p className="text-xs text-muted tabular-nums">{pending ? '\u00a0' : value === null ? '未記録' : change === null ? '前回比 —' : `前回比 ${signed(change)}`}</p>
  </div>
}
