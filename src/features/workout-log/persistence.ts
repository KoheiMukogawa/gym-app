import type { LogState } from './logReducer'

const KEY = 'gym-app.draft'

export type Draft = { state: LogState; workoutId: string | null }

function isLogState(value: unknown): value is LogState {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    (typeof s.currentExerciseId === 'string' || s.currentExerciseId === null) &&
    typeof s.weight_kg === 'number' &&
    typeof s.reps === 'number' &&
    Array.isArray(s.sets)
  )
}

export function saveDraft(draft: Draft): void {
  // 何も始まっていない状態を保存すると、次回起動時に空の下書きを復元してしまう
  if (draft.state.currentExerciseId === null && draft.state.sets.length === 0) {
    clearDraft()
    return
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // 容量超過やプライベートモードでの失敗は、記録そのものを妨げないため無視する
  }
}

export function loadDraft(): Draft | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!isLogState(parsed.state)) return null
    const workoutId = parsed.workoutId
    if (typeof workoutId !== 'string' && workoutId !== null) return null
    return { state: parsed.state, workoutId }
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 削除に失敗しても記録の妨げにはならないため無視する
  }
}
