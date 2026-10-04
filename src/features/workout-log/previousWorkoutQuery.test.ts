import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPreviousWorkout } from './queries'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return { supabase: createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: request },
  }) }
})

describe('fetchPreviousWorkout', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requests one prior day owned by the user, filters the nested exercise and sorts imported sets', async () => {
    request.mockResolvedValue(new Response(JSON.stringify([{
      performed_at: '2025-09-20T03:00:00Z',
      workout_sets: [
        { id: 'second', exercise_id: 'bench', set_index: 2, weight_kg: '80.0', reps: 8, note: '最後は補助あり' },
        { id: 'first', exercise_id: 'bench', set_index: 1, weight_kg: '60.0', reps: 10, note: null },
      ],
    }]), { headers: { 'Content-Type': 'application/json' } }))
    const result = await fetchPreviousWorkout('user-1', 'bench')
    const url = new URL(request.mock.calls[0][0])
    expect(url.pathname).toBe('/rest/v1/workouts')
    expect(url.searchParams.get('user_id')).toBe('eq.user-1')
    expect(url.searchParams.get('workout_sets.exercise_id')).toBe('eq.bench')
    expect(url.searchParams.get('select')).toContain('workout_sets!inner')
    expect(url.searchParams.get('order')).toBe('performed_at.desc')
    expect(url.searchParams.get('limit')).toBe('1')
    const start = new Date(); start.setHours(0, 0, 0, 0)
    expect(url.searchParams.get('performed_at')).toBe(`lt.${start.toISOString()}`)
    expect(result?.sets.map(set => set.id)).toEqual(['first', 'second'])
    expect(result?.sets[1]).toMatchObject({ weight_kg: 80, note: '最後は補助あり' })
  })

  it('returns no previous workout when there are no matching days', async () => {
    request.mockResolvedValue(new Response('[]', { headers: { 'Content-Type': 'application/json' } }))
    await expect(fetchPreviousWorkout('user-1', 'bench')).resolves.toBeNull()
  })

  it('keeps a database failure distinct from no history', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ message: 'permission denied', code: '42501' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    }))
    await expect(fetchPreviousWorkout('user-1', 'bench')).rejects.toMatchObject({ code: '42501' })
  })
})
