import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBig3ExerciseMappings, fetchStrengthSnapshot, saveBig3ExerciseMapping } from './queries'
import { buildStrengthSnapshot, type StrengthSet } from './strengthSnapshot'

const { from, rpc, mappingsQuery, mappingResult } = vi.hoisted(() => {
  const mappingResult = vi.fn()
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'delete', 'upsert']) query[method] = vi.fn(() => query)
  query.then = vi.fn((resolve) => Promise.resolve(mappingResult()).then(resolve))
  return { from: vi.fn(), rpc: vi.fn(), mappingsQuery: query, mappingResult }
})
vi.mock('../../lib/supabase', () => ({ supabase: { from, rpc } }))

const exercises = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
  { id: 'conventional', name: 'コンベンショナルデッドリフト', name_normalized: 'コンベンショナルデッドリフト', is_preset: false },
]

beforeEach(() => {
  vi.resetAllMocks()
  from.mockReturnValue(mappingsQuery)
  for (const method of ['select', 'eq', 'delete', 'upsert']) mappingsQuery[method].mockReturnValue(mappingsQuery)
  mappingsQuery.then.mockImplementation((resolve) => Promise.resolve(mappingResult()).then(resolve))
  mappingResult.mockReturnValue({ data: [], error: null })
  rpc.mockResolvedValue({ data: { exercises, mappings: [], sets: [] }, error: null })
})

describe('mapping persistence', () => {
  it('reads only the requested user mappings', async () => {
    await expect(fetchBig3ExerciseMappings('u1')).resolves.toEqual([])
    expect(mappingsQuery.eq).toHaveBeenCalledWith('user_id', 'u1')
  })
  it('upserts on the user/lift key', async () => {
    await saveBig3ExerciseMapping('u1', 'deadlift', 'conventional')
    expect(mappingsQuery.upsert).toHaveBeenCalledWith(
      { user_id: 'u1', lift_type: 'deadlift', exercise_id: 'conventional' },
      { onConflict: 'user_id,lift_type' },
    )
  })
  it('resets only the selected lift', async () => {
    await saveBig3ExerciseMapping('u1', 'deadlift', null)
    expect(mappingsQuery.delete).toHaveBeenCalledOnce()
    expect(mappingsQuery.eq.mock.calls).toEqual([['user_id', 'u1'], ['lift_type', 'deadlift']])
    expect(mappingsQuery.upsert).not.toHaveBeenCalled()
  })
  it('propagates mapping read and write failures', async () => {
    mappingResult.mockReturnValue({ data: null, error: { message: 'network error' } })
    await expect(fetchBig3ExerciseMappings('u1')).rejects.toMatchObject({ message: 'network error' })
    await expect(saveBig3ExerciseMapping('u1', 'deadlift', 'conventional')).rejects.toMatchObject({ message: 'network error' })
    await expect(saveBig3ExerciseMapping('u1', 'deadlift', null)).rejects.toMatchObject({ message: 'network error' })
  })
})

describe('fetchStrengthSnapshot', () => {
  it.each([false, true])('keeps all calculations unchanged (mapped=%s) with one authenticated RPC', async mapped => {
    const mappings = mapped ? [{ user_id: 'u1', lift_type: 'deadlift' as const, exercise_id: 'conventional' }] : []
    const sets: StrengthSet[] = [
      { exercise_id: 'squat', weight_kg: 160, reps: 5, performed_at: '2026-01-01T15:30:00Z' },
      { exercise_id: 'bench', weight_kg: 80, reps: 8, performed_at: '2026-01-01T15:30:00Z' },
      { exercise_id: 'deadlift', weight_kg: 200, reps: 1, performed_at: '2026-01-01T15:30:00Z' },
      { exercise_id: 'conventional', weight_kg: 220, reps: 3, performed_at: new Date().toISOString() },
    ]
    rpc.mockResolvedValue({ data: { exercises, mappings, sets }, error: null })
    expect(await fetchStrengthSnapshot('u1')).toEqual(buildStrengthSnapshot(exercises, mappings, sets))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('my_big3_data')
    expect(from).not.toHaveBeenCalled()
  })
  it('includes a PR beyond 1000 rows in the same response', async () => {
    const row = { exercise_id: 'deadlift', weight_kg: 100, reps: 1, performed_at: '2026-09-20T12:00:00Z' }
    rpc.mockResolvedValue({ data: { exercises, mappings: [], sets: [...Array.from({ length: 1000 }, () => row), { ...row, weight_kg: 220 }] }, error: null })
    expect((await fetchStrengthSnapshot('u1')).lifts.deadlift.pr1rm).toBe(220)
    expect(rpc).toHaveBeenCalledOnce()
  })
  it('keeps empty history distinct from a failed response', async () => {
    expect((await fetchStrengthSnapshot('u1')).prTotal).toBeNull()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'history unavailable' } })
    await expect(fetchStrengthSnapshot('u1')).rejects.toMatchObject({ message: 'history unavailable' })
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(fetchStrengthSnapshot('u1')).rejects.toThrow('BIG3の記録を取得できませんでした')
  })
  it('does not silently substitute defaults for malformed data', async () => {
    rpc.mockResolvedValueOnce({ data: { exercises, sets: [] }, error: null })
    await expect(fetchStrengthSnapshot('u1')).rejects.toThrow('BIG3の記録を取得できませんでした')
    expect(from).not.toHaveBeenCalled()
  })
})
