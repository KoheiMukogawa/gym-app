import type { LogState } from './logReducer'

const KEY_PREFIX = 'gym-app.draft.'

export type SetStatus = 'pending' | 'saved' | 'failed'

export type Draft = {
  state: LogState
  workoutId: string | null
  status: Record<string, SetStatus>
}

type StoredDraft = Draft & {
  // 共有端末で別のユーザーがサインインしたときに他人の記録中データを
  // 復元してしまわないよう、保存者と保存日を記録し loadDraft で検証する。
  userId: string
  date: string
}

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function isSetStatus(value: unknown): value is SetStatus {
  return value === 'pending' || value === 'saved' || value === 'failed'
}

function isStatusMap(value: unknown): value is Record<string, SetStatus> {
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value as Record<string, unknown>).every(isSetStatus)
}

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

export function saveDraft(userId: string, draft: Draft): void {
  // 何も始まっていない状態を保存すると、次回起動時に空の下書きを復元してしまう
  if (draft.state.currentExerciseId === null && draft.state.sets.length === 0) {
    clearDraft(userId)
    return
  }
  const stored: StoredDraft = { ...draft, userId, date: today() }
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(stored))
  } catch {
    // 容量超過やプライベートモードでの失敗は、記録そのものを妨げないため無視する
  }
}

export function loadDraft(userId: string): Draft | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(keyFor(userId))
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!isLogState(parsed.state)) return null
    const workoutId = parsed.workoutId
    if (typeof workoutId !== 'string' && workoutId !== null) return null
    if (!isStatusMap(parsed.status)) return null
    // 持ち主が違う、または当日の記録でない下書きは復元しない
    if (typeof parsed.userId !== 'string' || parsed.userId !== userId) return null
    if (typeof parsed.date !== 'string' || parsed.date !== today()) return null
    return { state: parsed.state, workoutId, status: parsed.status }
  } catch {
    return null
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // 削除に失敗しても記録の妨げにはならないため無視する
  }
}
