import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { localDate } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import { useSession } from '../auth/SessionProvider'
import { invalidateMonthWorkouts } from '../history/useMonthWorkouts'
import { fetchStrengthSnapshot } from './queries'
import { checkBest, checkStartingDate, startingTotal, type BestInput, type StartingBest } from './startingBests'
import { newStartingBestIds, saveStartingBests } from './startingBestsQueries'
import { LIFT_KEYS, LIFT_LABELS, type LiftKey, type StrengthSnapshot } from './strengthSnapshot'

const field = 'mt-1 min-h-14 w-full rounded-xl border border-border bg-bg px-4 text-fg tabular-nums'
const kg = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

export function StartingBestsPage() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()
  const [snapshot, setSnapshot] = useState<StrengthSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inputs, setInputs] = useState<Record<LiftKey, BestInput>>({
    squat: { weight: '', reps: '1' }, bench: { weight: '', reps: '1' }, deadlift: { weight: '', reps: '1' },
  })
  const [date, setDate] = useState(() => localDate())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Same IDs for every retry during this visit, so a lost response never duplicates sets.
  const ids = useRef(newStartingBestIds())

  const load = useCallback(() => {
    if (!userId) return
    setLoadError(null); setSnapshot(null)
    fetchStrengthSnapshot(userId).then(setSnapshot).catch((e: unknown) => setLoadError(toMessage(e)))
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loadError) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{loadError}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!snapshot) return <Spinner />

  const rows = LIFT_KEYS.map((lift) => ({ lift, info: snapshot.lifts[lift], check: checkBest(inputs[lift]) }))
  const usable = rows.filter((row) => row.info.exerciseId !== null)
  const dateError = checkStartingDate(date)
  const total = startingTotal(usable.map((row) => row.check))
  const entries: StartingBest[] = usable.flatMap((row) => row.check.status === 'ok'
    ? [{ lift: row.lift, exerciseId: row.info.exerciseId!, weightKg: row.check.weightKg, reps: row.check.reps }] : [])
  const canSave = !saving && entries.length > 0 && dateError === null && usable.every((row) => row.check.status !== 'invalid')

  function update(lift: LiftKey, key: keyof BestInput, value: string) {
    setInputs((current) => ({ ...current, [lift]: { ...current[lift], [key]: value } }))
  }

  async function save() {
    if (!userId || !canSave) return
    setSaving(true); setSaveError(null)
    try {
      await saveStartingBests(userId, date, entries, ids.current)
      invalidateMonthWorkouts()
      show('BIG3を登録しました')
      navigate('/big3')
    } catch (e: unknown) {
      // Say it is the save that failed, so it does not read as a problem with the numbers.
      setSaveError(`保存できませんでした。${toMessage(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return <section className="space-y-6 p-4">
    <div>
      <h1 className="text-2xl font-semibold">BIG3のベストを入れる</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">今のベストを入れると、推定1RM・合計・ランキングがすぐ使えます。入れたい種目だけで大丈夫です。1回だけ挙げた重量なら回数は1のまま、5回挙げた重量なら5にします。</p>
    </div>
    {rows.map(({ lift, info, check }) => {
      const name = info.exerciseName ?? LIFT_LABELS[lift]
      return <fieldset key={lift} className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 font-semibold">{name}</legend>
        {info.exerciseId === null
          ? <Link to="/big3" className="flex min-h-14 items-center text-sm text-accent">BIG3の設定で種目を選んでください</Link>
          : <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-muted">重量（kg）
                <input aria-label={`${name}の重量`} inputMode="decimal" autoComplete="off" value={inputs[lift].weight}
                  aria-invalid={check.status === 'invalid' || undefined} aria-describedby={check.status === 'invalid' ? `${lift}-error` : undefined}
                  onChange={(e) => update(lift, 'weight', e.target.value)} className={field} />
              </label>
              <label className="block text-sm text-muted">回数
                <input aria-label={`${name}の回数`} inputMode="numeric" autoComplete="off" value={inputs[lift].reps}
                  aria-invalid={check.status === 'invalid' || undefined} aria-describedby={check.status === 'invalid' ? `${lift}-error` : undefined}
                  onChange={(e) => update(lift, 'reps', e.target.value)} className={field} />
              </label>
            </div>
            {check.status === 'invalid' && <p id={`${lift}-error`} className="text-sm text-accent">{check.error}</p>}
            {check.status === 'ok' && <p className="text-sm text-muted">推定1RM <span className="font-semibold text-fg tabular-nums">{kg(check.e1rm)}</span> kg</p>}
          </>}
      </fieldset>
    })}
    <div className="rounded-xl border border-border bg-surface p-4" aria-live="polite">
      <p className="text-xs text-muted">{total && total.count < 3 ? `${total.count}種目の合計` : 'BIG3合計'}</p>
      <p className="text-3xl font-bold tabular-nums">{total ? kg(total.total) : '—'}<span className="ml-1 text-base font-normal text-muted">kg</span></p>
    </div>
    <label className="block text-sm text-muted">いつ頃の記録？
      <input type="date" aria-label="いつ頃の記録？" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} className={field} />
      {dateError && <span className="mt-1 block text-sm text-accent">{dateError}</span>}
    </label>
    {saveError && <p role="alert" className="rounded-xl border border-border bg-surface p-4 text-sm">{saveError}</p>}
    <Button onClick={save} disabled={!canSave}>{saving ? '登録中…' : 'BIG3を登録'}</Button>
    <p className="text-xs leading-relaxed text-muted">選んだ日の記録として保存します。あとから履歴の画面で直したり消したりできます。</p>
  </section>
}
