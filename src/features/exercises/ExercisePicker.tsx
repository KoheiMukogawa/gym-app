import { useMemo, useState } from 'react'
import { normalizeExerciseName } from '../../lib/calc'
import { toMessage } from '../../lib/errors'
import { MUSCLE_GROUP_LABELS, type Exercise, type MuscleGroup } from '../../lib/types'
import { Button } from '../../components/ui/Button'

type Props = {
  exercises: Exercise[]
  recentIds: string[]
  onSelect: (exercise: Exercise) => void
  onCreate: (name: string, group: MuscleGroup) => Promise<void>
}

const GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]

export function ExercisePicker({ exercises, recentIds, onSelect, onCreate }: Props) {
  const [query, setQuery] = useState('')
  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [group, setGroup] = useState<MuscleGroup>('chest')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = normalizeExerciseName(query)
    if (!q) return exercises
    return exercises.filter((e) => e.name_normalized.includes(q))
  }, [exercises, query])

  const recent = useMemo(
    () =>
      recentIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((e): e is Exercise => e !== undefined)
        .filter((e) => filtered.includes(e)),
    [recentIds, exercises, filtered],
  )

  const others = useMemo(() => filtered.filter((e) => !recent.includes(e)), [filtered, recent])

  if (creatingName !== null) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-lg font-semibold">「{creatingName}」を追加</h2>
        <div>
          <p className="mb-2 text-xs text-muted">部位を選んでください</p>
          <div className="grid grid-cols-3 gap-2">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={`min-h-14 rounded-xl border ${
                  group === g ? 'border-accent text-accent' : 'border-border text-fg'
                }`}
              >
                {MUSCLE_GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        </div>
        {createError && (
          <p role="alert" className="text-sm text-accent">
            {createError}
          </p>
        )}
        <Button
          size="lg"
          disabled={saving}
          onClick={async () => {
            setCreateError(null)
            setSaving(true)
            try {
              await onCreate(creatingName, group)
              setCreatingName(null)
              setQuery('')
            } catch (error) {
              setCreateError(toMessage(error))
            } finally {
              setSaving(false)
            }
          }}
        >
          追加する
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setCreatingName(null)
            setCreateError(null)
          }}
        >
          やめる
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <input
        type="search"
        role="searchbox"
        aria-label="種目を検索"
        placeholder="種目を検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="min-h-14 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent"
      />

      {recent.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs text-muted">最近使った種目</h3>
          <ul className="flex flex-col gap-2">
            {recent.map((e) => (
              <ExerciseRow key={`recent-${e.id}`} exercise={e} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs text-muted">すべての種目</h3>
          <ul className="flex flex-col gap-2">
            {others.map((e) => (
              <ExerciseRow key={e.id} exercise={e} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}

      {query.trim() !== '' && (
        <Button variant="ghost" onClick={() => setCreatingName(query.trim())}>
          「{query.trim()}」を追加
        </Button>
      )}
    </div>
  )
}

function ExerciseRow({
  exercise,
  onSelect,
}: {
  exercise: Exercise
  onSelect: (exercise: Exercise) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(exercise)}
        className="flex min-h-14 w-full items-center justify-between rounded-xl border border-border bg-surface px-4 text-left active:bg-border"
      >
        <span>{exercise.name}</span>
        <span className="text-xs text-muted">{MUSCLE_GROUP_LABELS[exercise.muscle_group]}</span>
      </button>
    </li>
  )
}
