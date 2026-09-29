import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBig3ExerciseMappings, fetchStrengthSnapshot, saveBig3ExerciseMapping } from './queries'

const { from, fetchExercises, mappingsQuery, setsQuery, mappingResult, setResult } = vi.hoisted(() => {
  const mappingResult = vi.fn()
  const setResult = vi.fn()
  const chain = (result: () => unknown) => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['select', 'eq', 'in', 'order', 'range', 'delete', 'upsert']) {
      query[method] = vi.fn(() => query)
    }
    query.then = vi.fn((resolve) => Promise.resolve(result()).then(resolve))
    return query
  }
  const mappingsQuery = chain(mappingResult)
  const setsQuery = chain(setResult)
  return { from: vi.fn(), fetchExercises: vi.fn(), mappingsQuery, setsQuery, mappingResult, setResult }
})
vi.mock('../../lib/supabase', () => ({ supabase: { from } }))
vi.mock('../exercises/queries', () => ({ fetchExercises }))

beforeEach(() => {
  vi.clearAllMocks()
  from.mockImplementation((table: string) => {
    if (table === 'big3_exercise_mappings') return mappingsQuery
    if (table === 'workout_sets') return setsQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  mappingResult.mockReturnValue({ data: [], error: null })
  setResult.mockReturnValue({ data: [], error: null })
  fetchExercises.mockResolvedValue([
    { id: 'preset', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
    { id: 'narrow', name: 'ナロウデッド', name_normalized: 'ナロウデッド', is_preset: false },
  ])
})

describe('mapping persistence', () => {
  it('reads only the requested user mappings', async () => {
    await expect(fetchBig3ExerciseMappings('u1')).resolves.toEqual([])
    expect(mappingsQuery.eq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('upserts on the user/lift key so changing an exercise replaces that mapping', async () => {
    await saveBig3ExerciseMapping('u1', 'deadlift', 'narrow')
    expect(mappingsQuery.upsert).toHaveBeenCalledWith(
      { user_id: 'u1', lift_type: 'deadlift', exercise_id: 'narrow' },
      { onConflict: 'user_id,lift_type' },
    )
  })

  it('resets only the selected lift for that user', async () => {
    await saveBig3ExerciseMapping('u1', 'deadlift', null)
    expect(mappingsQuery.delete).toHaveBeenCalledOnce()
    expect(mappingsQuery.eq.mock.calls).toEqual([['user_id', 'u1'], ['lift_type', 'deadlift']])
    expect(mappingsQuery.upsert).not.toHaveBeenCalled()
  })

  it('propagates mapping read and write failures', async () => {
    mappingResult.mockReturnValue({ data: null, error: { message: 'network error' } })
    await expect(fetchBig3ExerciseMappings('u1')).rejects.toMatchObject({ message: 'network error' })
    await expect(saveBig3ExerciseMapping('u1', 'deadlift', 'narrow')).rejects.toMatchObject({ message: 'network error' })
    await expect(saveBig3ExerciseMapping('u1', 'deadlift', null)).rejects.toMatchObject({ message: 'network error' })
  })
})

describe('fetchStrengthSnapshot', () => {
  it('filters history by the resolved exercises and owner', async () => {
    mappingResult.mockReturnValue({ data: [{ user_id: 'u1', lift_type: 'deadlift', exercise_id: 'narrow' }], error: null })
    setResult.mockReturnValue({ data: [{ exercise_id: 'narrow', weight_kg: 200, reps: 1, workouts: { performed_at: new Date().toISOString() } }], error: null })
    const snapshot = await fetchStrengthSnapshot('u1')
    expect(setsQuery.in).toHaveBeenCalledWith('exercise_id', ['narrow'])
    expect(setsQuery.eq).toHaveBeenCalledWith('workouts.user_id', 'u1')
    expect(snapshot.lifts.deadlift.pr1rm).toBe(200)
  })

  it('fetches preset history when there is no explicit mapping', async () => {
    await fetchStrengthSnapshot('u1')
    expect(setsQuery.in).toHaveBeenCalledWith('exercise_id', ['preset'])
  })

  it('does not query history when no exercises resolve', async () => {
    fetchExercises.mockResolvedValue([])
    const snapshot = await fetchStrengthSnapshot('u1')
    expect(from).not.toHaveBeenCalledWith('workout_sets')
    expect(snapshot.prTotal).toBeNull()
  })

  it('deduplicates exercise IDs when an exercise is selected for multiple lifts', async () => {
    mappingResult.mockReturnValue({ data: ['squat', 'bench', 'deadlift'].map((lift_type) => ({ user_id: 'u1', lift_type, exercise_id: 'narrow' })), error: null })
    await fetchStrengthSnapshot('u1')
    expect(setsQuery.in).toHaveBeenCalledWith('exercise_id', ['narrow'])
  })

  it('includes PRs beyond the first page of history', async () => {
    const row = { exercise_id: 'preset', weight_kg: 100, reps: 1, workouts: { performed_at: '2026-09-20T12:00:00Z' } }
    setResult.mockReturnValueOnce({ data: Array.from({ length: 1000 }, () => row), error: null })
      .mockReturnValueOnce({ data: [{ ...row, weight_kg: 220 }], error: null })
    expect((await fetchStrengthSnapshot('u1')).lifts.deadlift.pr1rm).toBe(220)
    expect(setsQuery.range.mock.calls).toEqual([[0, 999], [1000, 1999]])
  })

  it('does not silently use defaults when mapping reads fail', async () => {
    mappingResult.mockReturnValue({ data: null, error: { message: 'mapping unavailable' } })
    await expect(fetchStrengthSnapshot('u1')).rejects.toMatchObject({ message: 'mapping unavailable' })
    expect(from).not.toHaveBeenCalledWith('workout_sets')
  })

  it('propagates exercise and history errors', async () => {
    fetchExercises.mockRejectedValueOnce(new Error('exercises unavailable'))
    await expect(fetchStrengthSnapshot('u1')).rejects.toThrow('exercises unavailable')
    setResult.mockReturnValue({ data: null, error: { message: 'history unavailable' } })
    await expect(fetchStrengthSnapshot('u1')).rejects.toMatchObject({ message: 'history unavailable' })
  })
})
