import type { LogState } from './logReducer'
import type { ActiveRoutine } from '../routines/queries'
import type { ListRow, ListRows } from './listRows'

const KEY_PREFIX = 'gym-app.draft.'
// ユーザー単位の名前空間化（Important 5）より前に使っていたキー。
// 残っていても二度と読まれないので、気づいたときに掃除する。
const LEGACY_KEY = 'gym-app.draft'

/** queued: recorded on this device and waiting for a connection to be sent */
export type SetStatus = 'pending' | 'saved' | 'failed' | 'queued'

/** 電波がなくて送れなかったもの。deletes は消すセット、edits は上書き保存で送るセット（一覧入力で打ち直したもの） */
export type Outbox = { deletes: string[]; edits: string[] }

export type Draft = {
  state: LogState
  workoutId: string | null
  status: Record<string, SetStatus>
  routine?: ActiveRoutine | null
  /** 一覧入力で、まだ保存していない行 */
  listRows?: ListRows | null
  /** 一覧入力で、回数などを打つ前に閉じた行（種目ごと、重さはkg） */
  heldRows?: Record<string, ListRow[]>
  outbox?: Outbox
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
  // toISOString は UTC 基準の日付になり、JST (UTC+9) では朝9時ごろに日付が
  // ずれてしまう（同じ現地日でも下書きが「別の日」に見えて破棄される）。
  // sv-SE ロケールは YYYY-MM-DD 形式で、現地時刻の暦日を返す。
  return new Date().toLocaleDateString('sv-SE')
}

function isSetStatus(value: unknown): value is SetStatus {
  return value === 'pending' || value === 'saved' || value === 'failed' || value === 'queued'
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

function isRowList(rows: unknown): rows is ListRow[] {
  return Array.isArray(rows) && rows.every((r: Partial<ListRow> | null) =>
    typeof r?.id === 'string' && typeof r.weight === 'string' && typeof r.reps === 'string' && typeof r.note === 'string')
}

export function saveDraft(userId: string, draft: Draft): void {
  // 何も始まっていない状態を保存すると、次回起動時に空の下書きを復元してしまう
  if (draft.state.currentExerciseId === null && draft.state.sets.length === 0 && !Object.keys(draft.heldRows ?? {}).length && !draft.outbox?.deletes.length) {
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
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // 掃除に失敗しても記録の妨げにはならないため無視する
  }
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
    const routine = parsed.routine as ActiveRoutine | null | undefined
    const validRoutine = routine && typeof routine.name === 'string' && Array.isArray(routine.exerciseIds) &&
      routine.exerciseIds.length > 0 && routine.exerciseIds.every((id) => typeof id === 'string') &&
      Number.isInteger(routine.index) && routine.index >= 0 && routine.index < routine.exerciseIds.length
    const listRows = parsed.listRows as ListRows | null | undefined
    const validRows = listRows && typeof listRows.exerciseId === 'string' && isRowList(listRows.rows)
    const heldRows = parsed.heldRows as Record<string, ListRow[]> | undefined
    const validHeld = typeof heldRows === 'object' && heldRows !== null && Object.values(heldRows).every(isRowList)
    const outbox = parsed.outbox as Outbox | undefined
    const isIds = (ids: unknown) => Array.isArray(ids) && ids.every((id) => typeof id === 'string')
    const validOutbox = isIds(outbox?.deletes) && isIds(outbox?.edits)
    return {
      state: parsed.state, workoutId, status: parsed.status, ...(validRoutine ? { routine } : {}), ...(validRows ? { listRows } : {}),
      ...(validHeld ? { heldRows } : {}), ...(validOutbox ? { outbox } : {}),
    }
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
