import { useState } from 'react'
import { normalizeExerciseName } from '../../lib/calc'
import { InputError, toMessage } from '../../lib/errors'
import { MUSCLE_GROUP_LABELS, type Exercise, type MuscleGroup } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { isBasicExercise } from './catalog'

type Props = {
  exercises: Exercise[]
  recentIds: string[]
  userId?: string | null
  onSelect: (exercise: Exercise) => void
  onCreate: (name: string, group: MuscleGroup) => Promise<void>
}
const GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]

export function ExercisePicker({ exercises, recentIds, userId, onSelect, onCreate }: Props) {
  const [group, setGroup] = useState<MuscleGroup>('chest')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recent = recentIds.map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is Exercise => !!e).slice(0, 4)
  const visible = exercises.filter((e) => e.muscle_group === group &&
    (isBasicExercise(e) || (!e.is_preset && !!userId && e.created_by === userId)))

  async function create() {
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const existing = exercises.find((e) => e.name_normalized === normalizeExerciseName(name) &&
        (isBasicExercise(e) || e.created_by === userId))
      if (existing) {
        if (existing.muscle_group !== group) throw new InputError('同じ名前の種目が' + MUSCLE_GROUP_LABELS[existing.muscle_group] + 'にあります。別の名前を入力してください。')
        onSelect(existing)
      } else {
        await onCreate(name.trim(), group)
      }
      setCreating(false)
      setName('')
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      {recent.length > 0 && !creating && (
        <section aria-label="最近使った種目">
          <h2 className="mb-3 text-xs tracking-wide text-muted">最近使った種目</h2>
          <div className="grid grid-cols-2 gap-2">
            {recent.map((e) => (
              <button key={e.id} type="button" onClick={() => onSelect(e)}
                className="min-h-14 rounded-xl border border-border bg-surface px-3 py-3 text-left text-sm active:border-accent">
                {e.name}<span className="mt-1 block text-xs text-muted">{MUSCLE_GROUP_LABELS[e.muscle_group]}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-xs tracking-wide text-muted">部位から選ぶ</h2>
        <div className="grid grid-cols-3 gap-2">
          {GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} disabled={saving}
              onClick={() => { setGroup(g); setError(null) }}
              className={'min-h-14 rounded-xl border text-sm font-semibold ' + (group === g ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-muted')}>
              {MUSCLE_GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </section>
      {creating ? (
        <form className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
          onSubmit={(e) => { e.preventDefault(); void create() }}>
          <h2 className="font-semibold">{MUSCLE_GROUP_LABELS[group]}の種目を追加</h2>
          <label className="flex flex-col gap-2 text-sm text-muted">種目名
            <input autoFocus required maxLength={80} value={name} disabled={saving}
              onChange={(e) => setName(e.target.value)} placeholder="例：インクラインダンベルプレス"
              className="min-h-14 rounded-xl border border-border bg-bg px-3 text-fg" />
          </label>
          {error && <p role="alert" className="text-sm text-accent">{error}</p>}
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? '追加中…' : '追加して記録'}</Button>
          <Button variant="ghost" disabled={saving} onClick={() => { setCreating(false); setError(null) }}>キャンセル</Button>
        </form>
      ) : (
        <section aria-label={MUSCLE_GROUP_LABELS[group] + 'の種目'}>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {visible.map((e) => (
              <button key={e.id} type="button" onClick={() => onSelect(e)}
                className="flex min-h-16 w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 active:bg-border">
                <span>{e.name}{!e.is_preset && <span className="mt-1 block text-xs text-muted">自分の種目</span>}</span>
                <span aria-hidden="true" className="text-muted">→</span>
              </button>
            ))}
            {visible.length === 0 && <p className="p-4 text-sm text-muted">この部位の種目を追加しましょう</p>}
          </div>
          <button type="button" onClick={() => setCreating(true)} className="mt-2 min-h-14 w-full text-sm text-muted">
            ＋ {MUSCLE_GROUP_LABELS[group]}の種目を追加
          </button>
        </section>
      )}
    </div>
  )
}
