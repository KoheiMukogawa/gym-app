import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProfiles } from './queries'

const { order, select, from } = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ select }))
  return { order, select, from }
})

vi.mock('../../lib/supabase', () => ({ supabase: { from } }))

const PROFILES = [
  { id: 'u1', display_name: 'あき', created_at: '2026-08-01T00:00:00Z' },
  { id: 'u2', display_name: 'たろう', created_at: '2026-08-02T00:00:00Z' },
]

describe('fetchProfiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches profiles ordered by display name', async () => {
    order.mockResolvedValue({ data: PROFILES, error: null })

    await expect(fetchProfiles()).resolves.toEqual(PROFILES)
    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('*')
    expect(order).toHaveBeenCalledWith('display_name', { ascending: true })
  })

  it('returns an empty list when the response has no data', async () => {
    order.mockResolvedValue({ data: null, error: null })
    await expect(fetchProfiles()).resolves.toEqual([])
  })

  it('rejects when the query fails', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'network error' } })
    await expect(fetchProfiles()).rejects.toMatchObject({ message: 'network error' })
  })
})
