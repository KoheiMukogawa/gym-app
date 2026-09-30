import { normalizeExerciseName } from '../../lib/calc'
import type { Exercise, MuscleGroup } from '../../lib/types'

// Curate only the picker; historical records and Big3 mappings retain every ID.
export const BASIC_EXERCISES: Record<MuscleGroup, string[]> = {
  chest: ['ベンチプレス', 'ダンベルベンチプレス', 'チェストプレス', 'ダンベルフライ'],
  back: ['デッドリフト', 'ラットプルダウン', 'チンニング', 'シーテッドロウ'],
  legs: ['スクワット', 'レッグプレス', 'レッグエクステンション', 'レッグカール'],
  shoulders: ['ショルダープレス', 'サイドレイズ', 'リアレイズ'],
  arms: ['ダンベルカール', 'ハンマーカール', 'トライセプスプレスダウン'],
  core: ['クランチ', 'レッグレイズ', 'アブローラー'],
}

export function isBasicExercise(exercise: Exercise): boolean {
  return exercise.is_preset && BASIC_EXERCISES[exercise.muscle_group]
    .some((name) => normalizeExerciseName(name) === exercise.name_normalized)
}
