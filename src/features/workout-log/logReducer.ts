import { adjustReps, adjustWeight, DEFAULT_REPS, DEFAULT_WEIGHT, MIN_REPS, MIN_WEIGHT } from '../../lib/calc'

export type LoggedSet = {
  id: string
  exercise_id: string
  set_index: number
  weight_kg: number
  reps: number
  note?: string | null
}

export type LogState = {
  currentExerciseId: string | null
  weight_kg: number
  reps: number
  sets: LoggedSet[]
}

export type LogAction =
  | { type: 'select-exercise'; exerciseId: string; prefill: { weight_kg: number; reps: number } | null; defaultWeight?: number }
  | { type: 'adjust-weight'; direction: 1 | -1 }
  | { type: 'adjust-reps'; direction: 1 | -1 }
  | { type: 'set-weight'; value: number; min?: number }
  | { type: 'set-reps'; value: number }
  | { type: 'complete-set'; id: string; note?: string | null }
  | { type: 'set-note'; id: string; note: string | null }
  | { type: 'remove-set'; id: string }
  | { type: 'load-sets'; sets: LoggedSet[] }

export const initialLogState: LogState = {
  currentExerciseId: null,
  weight_kg: DEFAULT_WEIGHT,
  reps: DEFAULT_REPS,
  sets: [],
}

export function logReducer(state: LogState, action: LogAction): LogState {
  switch (action.type) {
    case 'select-exercise': {
      const done = state.sets.filter((s) => s.exercise_id === action.exerciseId)
      const last = done[done.length - 1]
      // 同じ種目に戻った場合は、この場で記録した直近の値を引き継ぐ
      const base = last ?? action.prefill
      return {
        ...state,
        currentExerciseId: action.exerciseId,
        weight_kg: base?.weight_kg ?? action.defaultWeight ?? DEFAULT_WEIGHT,
        reps: base?.reps ?? DEFAULT_REPS,
      }
    }
    case 'adjust-weight':
      return { ...state, weight_kg: adjustWeight(state.weight_kg, action.direction) }
    case 'adjust-reps':
      return { ...state, reps: adjustReps(state.reps, action.direction) }
    case 'set-weight':
      // numeric(5,1) の列に保存するため、小数第2位以下は表示と実データがずれる前に丸める
      // 自重種目ではアシスト分のマイナスを許すため、下限を呼び出し側から受け取る
      return { ...state, weight_kg: Math.max(action.min ?? MIN_WEIGHT, Math.round(action.value * 10) / 10) }
    case 'set-reps':
      return { ...state, reps: Math.max(MIN_REPS, Math.round(action.value)) }
    case 'complete-set': {
      const set = nextSet(state, action.id, action.note)
      if (set === null) return state
      return { ...state, sets: [...state.sets, set] }
    }
    case 'set-note': {
      return { ...state, sets: state.sets.map((s) => (s.id === action.id ? { ...s, note: action.note } : s)) }
    }
    case 'remove-set':
      return { ...state, sets: state.sets.filter((s) => s.id !== action.id) }
    case 'load-sets':
      return { ...state, sets: action.sets }
  }
}

/**
 * 次に記録されるセットを返す。complete-set と画面側の保存処理が
 * 別々に set_index を数えると値がずれるため、両者でこの関数を共有する。
 * id は呼び出し側（画面側）が生成し、dispatch と永続化の両方に同じ値を渡す。
 * これにより、同じセットの再試行が同じ id を持ち、DB 側で重複登録を防げる。
 */
export function nextSet(state: LogState, id: string, note?: string | null): LoggedSet | null {
  if (state.currentExerciseId === null) return null
  const exerciseId = state.currentExerciseId
  // 途中のセットを削除しても番号が重複しないよう、件数ではなく最大値の次にする
  const last = Math.max(0, ...state.sets.filter((s) => s.exercise_id === exerciseId).map((s) => s.set_index))
  return {
    id,
    exercise_id: exerciseId,
    set_index: last + 1,
    weight_kg: state.weight_kg,
    reps: state.reps,
    ...(note ? { note } : {}),
  }
}
