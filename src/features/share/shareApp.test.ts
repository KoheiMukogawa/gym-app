import { afterEach, describe, expect, it, vi } from 'vitest'
import { SHARE_URL, shareApp } from './shareApp'

const nav = navigator as Navigator & { share?: Navigator['share'] }

afterEach(() => {
  vi.restoreAllMocks()
  delete (nav as { share?: unknown }).share
})

describe('shareApp', () => {
  it('links to the landing page and marks sign-ups from it as shared', () => {
    expect(SHARE_URL).toMatch(/^https:\/\/[^/]+\/\?utm_source=share$/)
  })

  it('opens the device share sheet with the landing page link', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(nav, 'share', { value: share, configurable: true })
    await expect(shareApp()).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'Glog', url: SHARE_URL })
  })

  it('does nothing more when the share sheet is closed', async () => {
    Object.defineProperty(nav, 'share', { value: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')), configurable: true })
    const write = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    await expect(shareApp()).resolves.toBe('cancelled')
    expect(write).not.toHaveBeenCalled()
  })

  it('copies the link where there is no share sheet', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    await expect(shareApp()).resolves.toBe('copied')
    expect(write).toHaveBeenCalledWith(SHARE_URL)
  })
})
