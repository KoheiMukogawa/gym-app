import { normalizeExerciseName } from '../../lib/calc'
import type { Exercise, MuscleGroup } from '../../lib/types'

// Curate only the picker; historical records and Big3 mappings retain every ID.
export const BASIC_EXERCISES: Record<MuscleGroup, string[]> = {
  chest: ['ベンチプレス', 'ディップス', 'チェストプレス', 'スミスベンチ', 'ダンベルベンチプレス'],
  back: ['デッドリフト', 'ラットプルダウン', 'チンニング', 'シーテッドロウ'],
  legs: ['スクワット', 'レッグプレス', 'レッグエクステンション', 'レッグカール'],
  shoulders: ['サイドレイズ', 'ミリタリープレス', 'ショルダープレス'],
  arms: ['EZカール', 'ライングエクステンション'],
  core: [],
}

export const PICKER_GROUPS: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms']

export function exerciseLabel(exercise: Pick<Exercise, 'name' | 'is_preset' | 'name_normalized'>): string {
  return exercise.is_preset && exercise.name_normalized === 'ダンベルベンチプレス' ? 'ダンベルプレス' : exercise.name
}

export function armLabel(exercise: Exercise): string | null {
  if (exercise.muscle_group !== 'arms' || !exercise.is_preset) return null
  if (exercise.name_normalized === normalizeExerciseName('EZカール')) return '二頭筋'
  if (exercise.name_normalized === normalizeExerciseName('ライングエクステンション')) return '三頭筋'
  return null
}

export function sortExercises(exercises: Exercise[], order: string[]): Exercise[] {
  const rank = (e: Exercise) => {
    const custom = order.indexOf(e.id)
    if (custom >= 0) return custom
    const basic = BASIC_EXERCISES[e.muscle_group].findIndex((name) => normalizeExerciseName(name) === e.name_normalized)
    return order.length + (basic >= 0 && e.is_preset ? basic : 100)
  }
  return [...exercises].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ja'))
}

export function isBasicExercise(exercise: Exercise): boolean {
  return exercise.is_preset && BASIC_EXERCISES[exercise.muscle_group]
    .some((name) => normalizeExerciseName(name) === exercise.name_normalized)
}
