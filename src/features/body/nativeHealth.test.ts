import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, upsert, select, readBodyMetrics } = vi.hoisted(() => {
  const select = vi.fn()
  const upsert = vi.fn(() => ({ select }))
  return { select, upsert, from: vi.fn(() => ({ upsert })), readBodyMetrics: vi.fn() }
})
vi.mock('../../lib/supabase', () => ({ supabase: { from } }))
// 本物のCapacitorの部品と同じく、どの名前にも関数を返す（then も。呼ばれると返事をしない）
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => new Proxy({}, { get: (_, name) => name === 'readBodyMetrics' ? readBodyMetrics : () => new Promise(() => {}) }),
}))
import { dailyBodyMetrics, HEALTH_SYNCED_EVENT, healthPlugin, readHealthState, syncFromHealth, writeHealthState } from './nativeHealth'

const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime()

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  select.mockResolvedValue({ data: [], error: null })
})

describe('dailyBodyMetrics', () => {
  it('uses each local day’s latest weight and the same day’s latest body fat', () => {
    expect(dailyBodyMetrics(
      [{ time: at(6, 7), value: 70.04 }, { time: at(6, 21), value: 70.56 }, { time: at(5, 8), value: 71 }],
      [{ time: at(6, 7), value: 15.2 }, { time: at(6, 22), value: 15.84 }, { time: at(4, 8), value: 16 }],
    )).toEqual([
      { recorded_on: '2026-11-05', bodyweight_kg: 71, body_fat_pct: null },
      { recorded_on: '2026-11-06', bodyweight_kg: 70.6, body_fat_pct: 15.8 },
    ])
  })

  it('skips days without weight and values outside what BARBELL CLUB stores', () => {
    expect(dailyBodyMetrics(
      [{ time: at(1, 8), value: 19.9 }, { time: at(2, 8), value: 300.04 }, { time: at(3, 8), value: 65 }, { time: at(3, 9), value: Number.NaN }],
      [{ time: at(3, 8), value: 70.2 }, { time: at(7, 8), value: 12 }],
    )).toEqual([
      { recorded_on: '2026-11-02', bodyweight_kg: 300, body_fat_pct: null },
      { recorded_on: '2026-11-03', bodyweight_kg: 65, body_fat_pct: null },
    ])
  })
})

describe('healthPlugin', () => {
  it('resolves even though the native plugin answers to any name, including then', async () => {
    const health = await healthPlugin()
    expect(Object.keys(health).sort()).toEqual(['isAvailable', 'readBodyMetrics', 'requestAuthorization'])
  })
})

describe('syncFromHealth', () => {
  it('reads all history, adds only days BARBELL CLUB does not have, and remembers the sync', async () => {
    readBodyMetrics.mockResolvedValue({ weights: [{ time: at(5, 8), value: 71 }, { time: at(6, 8), value: 70 }], fats: [] })
    select.mockResolvedValue({ data: [{ recorded_on: '2026-11-06' }], error: null })
    const heard = vi.fn()
    window.addEventListener(HEALTH_SYNCED_EVENT, heard)
    await expect(syncFromHealth('u1')).resolves.toEqual({ found: 2, inserted: 1 })
    window.removeEventListener(HEALTH_SYNCED_EVENT, heard)

    expect(readBodyMetrics.mock.calls[0][0].startDate).toBe(new Date(2000, 0, 1).getTime())
    expect(from).toHaveBeenCalledWith('bodyweight_logs')
    expect(upsert).toHaveBeenCalledWith([
      { user_id: 'u1', recorded_on: '2026-11-05', bodyweight_kg: 71, body_fat_pct: null },
      { user_id: 'u1', recorded_on: '2026-11-06', bodyweight_kg: 70, body_fat_pct: null },
    ], { onConflict: 'user_id,recorded_on', ignoreDuplicates: true })
    expect(readHealthState('u1')).toMatchObject({ enabled: true })
    expect(readHealthState('u1').lastSyncedAt).not.toBeNull()
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ found: 2, inserted: 1 })
  })

  it('reads from a week before the last sync and sends large histories in parts', async () => {
    const weights = Array.from({ length: 1200 }, (_, i) => ({ time: new Date(2020, 0, 1 + i, 8).getTime(), value: 70 }))
    readBodyMetrics.mockResolvedValue({ weights, fats: [] })
    await syncFromHealth('u1', '2026-11-06T00:00:00.000Z')
    expect(readBodyMetrics.mock.calls[0][0].startDate).toBe(new Date('2026-10-30T00:00:00.000Z').getTime())
    expect(upsert.mock.calls.map((call) => (call as unknown as [unknown[]])[0].length)).toEqual([500, 500, 200])
  })

  it('keeps the previous state when saving fails', async () => {
    writeHealthState('u1', { enabled: true, lastSyncedAt: '2026-11-01T00:00:00.000Z' })
    readBodyMetrics.mockResolvedValue({ weights: [{ time: at(6, 8), value: 70 }], fats: [] })
    select.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(syncFromHealth('u1')).rejects.toMatchObject({ message: 'boom' })
    expect(readHealthState('u1').lastSyncedAt).toBe('2026-11-01T00:00:00.000Z')
  })
})
