import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installStaleBuildRecovery } from './staleBuild'

function fakeWindow(storage: Storage | null = sessionStorage) {
  const target = new EventTarget() as EventTarget & { sessionStorage: Storage; location: { reload: () => void } }
  Object.defineProperty(target, 'sessionStorage', { get: () => { if (!storage) throw new Error('blocked'); return storage } })
  target.location = { reload: vi.fn() }
  return target
}
const fail = (target: EventTarget) => target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))

beforeEach(() => sessionStorage.clear())

describe('installStaleBuildRecovery', () => {
  it('reloads once when a screen of the previous build cannot be loaded', () => {
    const target = fakeWindow()
    installStaleBuildRecovery(target, () => 1_000_000)
    fail(target)
    expect(target.location.reload).toHaveBeenCalledOnce()
  })

  it('does not reload again right after a reload, so a real outage shows the error screen', () => {
    let now = 1_000_000
    const first = fakeWindow()
    installStaleBuildRecovery(first, () => now)
    fail(first)
    now += 5_000
    const afterReload = fakeWindow()
    installStaleBuildRecovery(afterReload, () => now)
    fail(afterReload)
    expect(afterReload.location.reload).not.toHaveBeenCalled()
    now += 60_000
    fail(afterReload)
    expect(afterReload.location.reload).toHaveBeenCalledOnce()
  })

  it('leaves the error to the screen when session storage is unavailable', () => {
    const target = fakeWindow(null)
    installStaleBuildRecovery(target, () => 1_000_000)
    fail(target)
    expect(target.location.reload).not.toHaveBeenCalled()
  })

  it('does not swallow the error, so the screen still shows its fallback until the reload', () => {
    const target = fakeWindow()
    installStaleBuildRecovery(target, () => 1_000_000)
    expect(fail(target)).toBe(true)
  })

  it('stops listening when uninstalled', () => {
    const target = fakeWindow()
    const uninstall = installStaleBuildRecovery(target, () => 1_000_000)
    uninstall()
    fail(target)
    expect(target.location.reload).not.toHaveBeenCalled()
  })
})
