import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatedWorkout, fetchEditableWorkout, saveEditableSet, updateWorkoutDate, updateWorkoutSet } from './editorQueries'

const { q, from } = vi.hoisted(() => {
  const q = {
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(),
    insert: vi.fn(), update: vi.fn(), upsert: vi.fn(),
  }
  const from = vi.fn(() => q)
  return { q, from }
})
vi.mock('../../lib/supabase', () => ({ supabase: { from } }))
beforeEach(() => {
  vi.resetAllMocks()
  from.mockReturnValue(q)
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q)
  q.update.mockReturnValue(q); q.upsert.mockReturnValue(q)
  q.single.mockResolvedValue({ data: { id: 'w1' }, error: null })
})
describe('workout editing persistence', () => {
  it('accepts an assisted (negative) load only when the caller allows it', async () => {
    const set = { id: 's1', exercise_id: 'chin', set_index: 1, weight_kg: -20, reps: 8, note: 'band' }
    await expect(updateWorkoutSet('w1', set)).rejects.toThrow()
    await updateWorkoutSet('w1', set, -70)
    expect(q.update).toHaveBeenCalledWith({ exercise_id: 'chin', set_index: 1, weight_kg: -20, reps: 8, note: 'band' })
  })
  it('scopes editable reads by both workout and signed-in user', async () => {
    q.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await fetchEditableWorkout('u1', 'w1')).toBeNull()
    expect(q.eq.mock.calls).toEqual([['id', 'w1'], ['user_id', 'u1']])
  })
  it('scopes date updates by owner and fails if no row was updated', async () => {
    q.single.mockResolvedValue({ error: { code: 'PGRST116' } })
    await expect(updateWorkoutDate('u1', 'w1', '2020-02-03', '2020-01-01T12:00:00Z')).rejects.toMatchObject({ code: 'PGRST116' })
    expect(q.eq.mock.calls).toEqual([['id', 'w1'], ['user_id', 'u1']])
  })
  it('only patches editable fields on the requested workout', async () => {
    const set = { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 62.5, reps: 8, created_at: 'ignored' }
    await updateWorkoutSet('w1', set)
    expect(q.update).toHaveBeenCalledWith({ exercise_id: 'bench', set_index: 1, weight_kg: 62.5, reps: 8, note: null })
    expect(q.eq.mock.calls).toEqual([['id', 's1'], ['workout_id', 'w1']])
  })
  it('upserts the same client ID with corrected values on retry', async () => {
    await saveEditableSet('w1', { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 65, reps: 9 })
    expect(q.upsert).toHaveBeenCalledWith({ id: 's1', workout_id: 'w1', exercise_id: 'bench', set_index: 1, weight_kg: 65, reps: 9, note: null }, { onConflict: 'id' })
  })
  it('rejects invalid input before a database mutation', async () => {
    await expect(saveEditableSet('w1', { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: -1, reps: 9 })).rejects.toThrow()
    expect(from).not.toHaveBeenCalled()
  })
  it('accepts a duplicate workout ID only after verifying its owner', async () => {
    q.insert.mockResolvedValue({ error: { code: '23505' } })
    q.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(createDatedWorkout('u1', 'w1', '2020-02-03')).rejects.toMatchObject({ code: '23505' })
    q.maybeSingle.mockResolvedValue({ data: { id: 'w1', performed_at: '2020-02-03T12:00:00Z' }, error: null })
    await expect(createDatedWorkout('u1', 'w1', '2020-02-03')).resolves.toBeUndefined()
  })
  it('applies a corrected date when retrying a workout whose response was lost', async () => {
    q.insert.mockResolvedValue({ error: { code: '23505' } })
    q.maybeSingle.mockResolvedValue({ data: { id: 'w1', performed_at: '2020-02-03T12:00:00Z' }, error: null })
    await createDatedWorkout('u1', 'w1', '2020-02-04')
    expect(q.update).toHaveBeenCalledWith({ performed_at: expect.any(String) })
  })
})
