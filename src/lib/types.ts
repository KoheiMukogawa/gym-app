export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core'

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  core: '体幹',
}

export type Profile = {
  id: string
  display_name: string
  created_at: string
}

export type Exercise = {
  id: string
  name: string
  name_normalized: string
  muscle_group: MuscleGroup
  is_preset: boolean
  created_by: string | null
  created_at: string
}

export type Workout = {
  id: string
  user_id: string
  performed_at: string
  note: string | null
  created_at: string
}

export type WorkoutSet = {
  id: string
  workout_id: string
  exercise_id: string
  set_index: number
  weight_kg: number
  reps: number
  created_at: string
}

/** ワークアウトの実施日時を結合したセット。グラフ描画に使う。 */
export type SetWithDate = WorkoutSet & { performed_at: string }
