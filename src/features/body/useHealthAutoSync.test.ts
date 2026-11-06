import { beforeEach, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const { syncFromHealth } = vi.hoisted(() => ({ syncFromHealth: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./nativeHealth', async (original) => ({ ...await original<typeof import('./nativeHealth')>(), syncFromHealth }))
import { writeHealthState } from './nativeHealth'
import { useHealthAutoSync } from './useHealthAutoSync'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  syncFromHealth.mockResolvedValue({ found: 0, inserted: 0 })
})

it('reads recent records on launch when the sync is on and due', () => {
  const last = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  writeHealthState('u1', { enabled: true, lastSyncedAt: last })
  renderHook(() => useHealthAutoSync('u1', true))
  expect(syncFromHealth).toHaveBeenCalledWith('u1', last)
})

it('waits when the last sync was moments ago, and does nothing when off or on the web', () => {
  writeHealthState('u1', { enabled: true, lastSyncedAt: new Date().toISOString() })
  renderHook(() => useHealthAutoSync('u1', true))
  writeHealthState('u2', { enabled: false, lastSyncedAt: null })
  renderHook(() => useHealthAutoSync('u2', true))
  writeHealthState('u3', { enabled: true, lastSyncedAt: null })
  renderHook(() => useHealthAutoSync('u3', false))
  expect(syncFromHealth).not.toHaveBeenCalled()
})

it('syncs again when the app comes back to the front after a while', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  writeHealthState('u1', { enabled: true, lastSyncedAt: null })
  renderHook(() => useHealthAutoSync('u1', true))
  await waitFor(() => expect(syncFromHealth).toHaveBeenCalledTimes(1))
  // 前回から15分たっていれば、前に戻ったときにもう一度読む
  writeHealthState('u1', { enabled: true, lastSyncedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() })
  document.dispatchEvent(new Event('visibilitychange'))
  await waitFor(() => expect(syncFromHealth).toHaveBeenCalledTimes(2))
})
