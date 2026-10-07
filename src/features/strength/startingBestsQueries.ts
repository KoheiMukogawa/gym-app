import { InputError } from '../../lib/errors'
import { createDatedWorkout, fetchEditableWorkout, findWorkoutOnDate, saveEditableSet } from '../history/editorQueries'
import { deleteWorkoutIfEmpty } from '../workout-log/queries'
import type { StartingBest } from './startingBests'
import type { LiftKey } from './strengthSnapshot'

/** Generated once per visit to the page and reused on every retry, so a retry never duplicates. */
export type StartingBestIds = { workoutId: string; setIds: Record<LiftKey, string> }

export function newStartingBestIds(): StartingBestIds {
  return {
    workoutId: crypto.randomUUID(),
    setIds: { squat: crypto.randomUUID(), bench: crypto.randomUUID(), deadlift: crypto.randomUUID() },
  }
}

/**
 * Saves the bests as ordinary sets on the chosen day: into that day's workout if there is one,
 * otherwise into a new workout with our own ID. Sets are upserted by ID, so a retry overwrites
 * them (and moves them if the date changed) instead of adding more.
 */
export async function saveStartingBests(userId: string, date: string, entries: StartingBest[], ids: StartingBestIds): Promise<void> {
  if (entries.length === 0) throw new InputError('1種目以上入れてください')
  const existing = await findWorkoutOnDate(userId, date)
  const target = existing ?? ids.workoutId
  if (!existing) await createDatedWorkout(userId, ids.workoutId, date)
  const workout = await fetchEditableWorkout(userId, target)
  if (!workout) throw new Error('記録を保存できませんでした。もう一度お試しください')

  // Count from sets that are not ours, so a retry keeps its numbers.
  const own = new Set(Object.values(ids.setIds))
  const last = new Map<string, number>()
  for (const s of workout.workout_sets) {
    if (own.has(s.id)) continue
    last.set(s.exercise_id, Math.max(last.get(s.exercise_id) ?? 0, s.set_index))
  }
  for (const entry of entries) {
    const index = (last.get(entry.exerciseId) ?? 0) + 1
    last.set(entry.exerciseId, index)
    await saveEditableSet(target, {
      id: ids.setIds[entry.lift], exercise_id: entry.exerciseId, weight_kg: entry.weightKg, reps: entry.reps, set_index: index, note: null,
    })
  }
  // A failed attempt on another date may have left our own workout empty.
  if (target !== ids.workoutId) await deleteWorkoutIfEmpty(ids.workoutId)
}
