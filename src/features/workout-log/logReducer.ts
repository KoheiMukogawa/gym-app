import { adjustReps, adjustWeight, DEFAULT_REPS, DEFAULT_WEIGHT, MIN_REPS, MIN_WEIGHT } from '../../lib/calc'

export type LoggedSet = {
  exercise_id: string
  set_index: number
  weight_kg: number
  reps: number
}

export type LogState = {
  currentExerciseId: string | null
  weight_kg: number
  reps: number
  sets: LoggedSet[]
}

export type LogAction =
  | { type: 'select-exercise'; exerciseId: string; prefill: { weight_kg: number; reps: number } | null }
  | { type: 'adjust-weight'; direction: 1 | -1 }
  | { type: 'adjust-reps'; direction: 1 | -1 }
  | { type: 'set-weight'; value: number }
  | { type: 'set-reps'; value: number }
  | { type: 'complete-set' }
  | { type: 'undo-last-set' }

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
        weight_kg: base?.weight_kg ?? DEFAULT_WEIGHT,
        reps: base?.reps ?? DEFAULT_REPS,
      }
    }
    case 'adjust-weight':
      return { ...state, weight_kg: adjustWeight(state.weight_kg, action.direction) }
    case 'adjust-reps':
      return { ...state, reps: adjustReps(state.reps, action.direction) }
    case 'set-weight':
      return { ...state, weight_kg: Math.max(MIN_WEIGHT, action.value) }
    case 'set-reps':
      return { ...state, reps: Math.max(MIN_REPS, Math.round(action.value)) }
    case 'complete-set': {
      const set = nextSet(state)
      if (set === null) return state
      return { ...state, sets: [...state.sets, set] }
    }
    case 'undo-last-set':
      return { ...state, sets: state.sets.slice(0, -1) }
  }
}

/**
 * 次に記録されるセットを返す。complete-set と画面側の保存処理が
 * 別々に set_index を数えると値がずれるため、両者でこの関数を共有する。
 */
export function nextSet(state: LogState): LoggedSet | null {
  if (state.currentExerciseId === null) return null
  const exerciseId = state.currentExerciseId
  const count = state.sets.filter((s) => s.exercise_id === exerciseId).length
  return {
    exercise_id: exerciseId,
    set_index: count + 1,
    weight_kg: state.weight_kg,
    reps: state.reps,
  }
}
