import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  findWorkoutOnDate: vi.fn(), createDatedWorkout: vi.fn(), fetchEditableWorkout: vi.fn(), saveEditableSet: vi.fn(),
  deleteWorkoutIfEmpty: vi.fn(),
}))
vi.mock('../history/editorQueries', () => ({
  findWorkoutOnDate: m.findWorkoutOnDate, createDatedWorkout: m.createDatedWorkout,
  fetchEditableWorkout: m.fetchEditableWorkout, saveEditableSet: m.saveEditableSet,
}))
vi.mock('../workout-log/queries', () => ({ deleteWorkoutIfEmpty: m.deleteWorkoutIfEmpty }))
import { newStartingBestIds, saveStartingBests } from './startingBestsQueries'

const ids = { workoutId: 'own', setIds: { squat: 's-sq', bench: 's-be', deadlift: 's-dl' } }
const set = (id: string, exercise_id: string, set_index: number) => ({ id, exercise_id, set_index, weight_kg: 60, reps: 5, note: null, workout_id: 'x', created_at: '' })

beforeEach(() => {
  vi.resetAllMocks()
  m.createDatedWorkout.mockResolvedValue(undefined)
  m.saveEditableSet.mockResolvedValue(undefined)
  m.deleteWorkoutIfEmpty.mockResolvedValue(false)
})

describe('saveStartingBests', () => {
  it('creates the day with its own ID when the day has no workout, and saves one set per lift', async () => {
    m.findWorkoutOnDate.mockResolvedValue(null)
    m.fetchEditableWorkout.mockResolvedValue({ id: 'own', workout_sets: [] })
    await saveStartingBests('u1', '2026-09-01', [
      { lift: 'squat', exerciseId: 'squat', weightKg: 140, reps: 1 },
      { lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 5 },
    ], ids)
    expect(m.createDatedWorkout).toHaveBeenCalledWith('u1', 'own', '2026-09-01')
    expect(m.saveEditableSet.mock.calls).toEqual([
      ['own', { id: 's-sq', exercise_id: 'squat', weight_kg: 140, reps: 1, set_index: 1, note: null }],
      ['own', { id: 's-be', exercise_id: 'bench', weight_kg: 100, reps: 5, set_index: 1, note: null }],
    ])
    expect(m.deleteWorkoutIfEmpty).not.toHaveBeenCalled()
  })

  it('adds to an existing day after its sets, and clears an empty workout left by an earlier attempt', async () => {
    m.findWorkoutOnDate.mockResolvedValue('day')
    m.fetchEditableWorkout.mockResolvedValue({ id: 'day', workout_sets: [set('a', 'bench', 1), set('b', 'bench', 2)] })
    await saveStartingBests('u1', '2026-09-01', [{ lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 1 }], ids)
    expect(m.createDatedWorkout).not.toHaveBeenCalled()
    expect(m.saveEditableSet).toHaveBeenCalledWith('day', { id: 's-be', exercise_id: 'bench', weight_kg: 100, reps: 1, set_index: 3, note: null })
    expect(m.deleteWorkoutIfEmpty).toHaveBeenCalledWith('own')
  })

  it('keeps the same index for its own set on a retry, so numbers do not skip', async () => {
    m.findWorkoutOnDate.mockResolvedValue('own')
    m.fetchEditableWorkout.mockResolvedValue({ id: 'own', workout_sets: [set('s-sq', 'squat', 1)] })
    await saveStartingBests('u1', '2026-09-01', [{ lift: 'squat', exerciseId: 'squat', weightKg: 140, reps: 1 }], ids)
    expect(m.saveEditableSet).toHaveBeenCalledWith('own', expect.objectContaining({ id: 's-sq', set_index: 1 }))
  })

  it('numbers two lifts that share one exercise one after the other', async () => {
    m.findWorkoutOnDate.mockResolvedValue(null)
    m.fetchEditableWorkout.mockResolvedValue({ id: 'own', workout_sets: [] })
    await saveStartingBests('u1', '2026-09-01', [
      { lift: 'squat', exerciseId: 'same', weightKg: 140, reps: 1 },
      { lift: 'deadlift', exerciseId: 'same', weightKg: 180, reps: 1 },
    ], ids)
    expect(m.saveEditableSet.mock.calls.map(([, s]) => [s.id, s.set_index])).toEqual([['s-sq', 1], ['s-dl', 2]])
  })

  it('refuses an empty list and reports a workout that cannot be read back', async () => {
    await expect(saveStartingBests('u1', '2026-09-01', [], ids)).rejects.toThrow('1種目以上入れてください')
    m.findWorkoutOnDate.mockResolvedValue(null)
    m.fetchEditableWorkout.mockResolvedValue(null)
    await expect(saveStartingBests('u1', '2026-09-01', [{ lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 1 }], ids))
      .rejects.toThrow('記録を保存できませんでした')
  })

  it('makes distinct IDs for the workout and each lift', () => {
    const made = newStartingBestIds()
    expect(new Set([made.workoutId, ...Object.values(made.setIds)]).size).toBe(4)
  })
})
