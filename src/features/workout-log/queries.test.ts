import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveSet, deleteWorkoutIfEmpty } from './queries'

const { insert, deleteMock, selectHead } = vi.hoisted(() => ({
  insert: vi.fn(),
  deleteMock: vi.fn(),
  selectHead: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'workout_sets') {
        return {
          insert,
          select: () => ({ eq: () => selectHead() }),
        }
      }
      if (table === 'workouts') {
        return {
          delete: () => ({ eq: () => deleteMock() }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  },
}))

const SET = { id: 's1', exercise_id: 'bench', set_index: 1, weight_kg: 80, reps: 8 }

describe('saveSet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves when the insert reports a primary-key duplicate (23505) — the set was already committed by an earlier attempt', async () => {
    insert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    await expect(saveSet('w1', SET)).resolves.toBeUndefined()
  })

  it('rethrows on a foreign key violation (23503) — the parent workout no longer exists', async () => {
    insert.mockResolvedValue({
      error: { code: '23503', message: 'insert or update on table violates foreign key constraint' },
    })
    await expect(saveSet('w1', SET)).rejects.toMatchObject({ code: '23503' })
  })

  it('rethrows on a row-level security rejection (42501)', async () => {
    insert.mockResolvedValue({
      error: { code: '42501', message: 'new row violates row-level security policy' },
    })
    await expect(saveSet('w1', SET)).rejects.toMatchObject({ code: '42501' })
  })

  it('resolves without error when the insert succeeds', async () => {
    insert.mockResolvedValue({ error: null })
    await expect(saveSet('w1', SET)).resolves.toBeUndefined()
  })
})

describe('deleteWorkoutIfEmpty', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes and reports true when the set count is zero', async () => {
    selectHead.mockResolvedValue({ count: 0, error: null })
    deleteMock.mockResolvedValue({ error: null })
    await expect(deleteWorkoutIfEmpty('w1')).resolves.toBe(true)
    expect(deleteMock).toHaveBeenCalledTimes(1)
  })

  it('does not delete and reports false when the workout has sets', async () => {
    selectHead.mockResolvedValue({ count: 2, error: null })
    await expect(deleteWorkoutIfEmpty('w1')).resolves.toBe(false)
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('does not delete and reports false when the count is unknown (null)', async () => {
    selectHead.mockResolvedValue({ count: null, error: null })
    await expect(deleteWorkoutIfEmpty('w1')).resolves.toBe(false)
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
