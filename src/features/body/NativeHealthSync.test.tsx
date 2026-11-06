import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { isAvailable, requestAuthorization, syncFromHealth } = vi.hoisted(() => ({ isAvailable: vi.fn(), requestAuthorization: vi.fn(), syncFromHealth: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./nativeHealth', async (original) => ({
  ...await original<typeof import('./nativeHealth')>(),
  healthPlugin: async () => ({ isAvailable, requestAuthorization }),
  syncFromHealth,
}))
import { HEALTH_SYNCED_EVENT, readHealthState, writeHealthState } from './nativeHealth'
import { NativeHealthSync } from './NativeHealthSync'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  isAvailable.mockResolvedValue({ available: true })
  requestAuthorization.mockResolvedValue(undefined)
  syncFromHealth.mockImplementation(async (userId: string) => {
    writeHealthState(userId, { enabled: true, lastSyncedAt: '2026-11-06T13:00:00.000Z' })
    return { found: 30, inserted: 28 }
  })
})

it('asks for permission, imports everything and turns the sync on', async () => {
  const onBusyChange = vi.fn()
  render(<NativeHealthSync userId="u1" onBusyChange={onBusyChange} />)
  await userEvent.click(screen.getByRole('button', { name: 'ヘルスケアと連携する' }))
  expect(requestAuthorization).toHaveBeenCalled()
  expect(syncFromHealth).toHaveBeenCalledWith('u1')
  expect(await screen.findByRole('status')).toHaveTextContent('28日分の記録を読み込みました。BARBELL CLUBに記録があった2日はそのままです。')
  expect(screen.getByRole('button', { name: '今すぐ読み込む' })).toBeInTheDocument()
  expect(onBusyChange.mock.calls).toEqual([[true], [false]])
})

it('explains where to allow reading when Health returns nothing', async () => {
  syncFromHealth.mockResolvedValue({ found: 0, inserted: 0 })
  render(<NativeHealthSync userId="u1" />)
  await userEvent.click(screen.getByRole('button', { name: 'ヘルスケアと連携する' }))
  expect(await screen.findByRole('status')).toHaveTextContent('データアクセスとデバイス')
})

it('shows an error and stays off on devices without Health', async () => {
  isAvailable.mockResolvedValue({ available: false })
  render(<NativeHealthSync userId="u1" />)
  await userEvent.click(screen.getByRole('button', { name: 'ヘルスケアと連携する' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('この端末ではヘルスケアを使えません。')
  expect(syncFromHealth).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'ヘルスケアと連携する' })).toBeInTheDocument()
})

it('syncs again on demand and can be turned off, keeping the records', async () => {
  writeHealthState('u1', { enabled: true, lastSyncedAt: '2026-11-06T13:00:00.000Z' })
  syncFromHealth.mockResolvedValue({ found: 30, inserted: 0 })
  render(<NativeHealthSync userId="u1" />)
  await userEvent.click(screen.getByRole('button', { name: '今すぐ読み込む' }))
  expect(await screen.findByRole('status')).toHaveTextContent('新しい記録はありませんでした。')
  await userEvent.click(screen.getByRole('button', { name: '連携をやめる' }))
  expect(await screen.findByRole('status')).toHaveTextContent('読み込んだ記録は残ります')
  expect(readHealthState('u1').enabled).toBe(false)
  expect(screen.getByRole('button', { name: 'ヘルスケアと連携する' })).toBeInTheDocument()
})

it('reloads the records when the automatic sync added days', () => {
  const onReload = vi.fn()
  render(<NativeHealthSync userId="u1" onReload={onReload} />)
  act(() => { window.dispatchEvent(new CustomEvent(HEALTH_SYNCED_EVENT, { detail: { found: 3, inserted: 0 } })) })
  expect(onReload).not.toHaveBeenCalled()
  act(() => { window.dispatchEvent(new CustomEvent(HEALTH_SYNCED_EVENT, { detail: { found: 3, inserted: 2 } })) })
  expect(onReload).toHaveBeenCalledTimes(1)
})
