import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchExercise } from './queries'

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'exercises') {
        return { select: () => ({ eq: () => ({ maybeSingle }) }) }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  },
}))

const EXERCISE = {
  id: 'bench',
  name: 'ベンチプレス',
  name_normalized: 'ベンチプレス',
  muscle_group: 'chest' as const,
  is_preset: true,
  created_by: null,
  created_at: '2026-08-01T00:00:00Z',
}

describe('fetchExercise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Coverage: the ordinary found-row path still resolves the exercise.
  it('resolves the exercise when the row exists', async () => {
    maybeSingle.mockResolvedValue({ data: EXERCISE, error: null })
    await expect(fetchExercise('bench')).resolves.toEqual(EXERCISE)
  })

  // Regression: this is the query-layer half of the "not-found is dead code"
  // bug the review flagged. PostgREST's `.maybeSingle()` resolves
  // `{ data: null, error: null }` when zero rows match — this is exactly what
  // a stale deep link or a deleted exercise looks like on the wire. Before this
  // fix, fetchExercise used `.single()`, which turns that same zero-row result
  // into a PGRST116 *error* instead, so this call would have rejected instead
  // of resolving null. Verified against the pre-fix (`.single()`) source below.
  it('resolves null (does not throw) when no row matches — a missing/deleted exercise', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(fetchExercise('does-not-exist')).resolves.toBeNull()
  })

  // Coverage: a genuine query failure (network, RLS, etc.) still rejects, so the
  // caller can tell "transient failure" apart from "no such row".
  it('rejects when the query itself fails', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'network error' } })
    await expect(fetchExercise('bench')).rejects.toMatchObject({ message: 'network error' })
  })
})
