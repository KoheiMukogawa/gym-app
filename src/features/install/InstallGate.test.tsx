import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { InstallGate } from './InstallGate'
import { InstallCard } from './InstallCard'
import { markSignedUp, markWorkoutFinished, openInstallGuide } from './installGuide'

const { loadDraft } = vi.hoisted(() => ({ loadDraft: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))
vi.mock('../workout-log/persistence', () => ({ loadDraft }))

// jsdom does not implement the modal top layer.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0'
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
function device(userAgent: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query.includes('standalone'), addEventListener() {}, removeEventListener() {} }))
}
function renderGate(path = '/') {
  render(<MemoryRouter initialEntries={[path]}><InstallGate /><InstallCard /></MemoryRouter>)
}
const sheet = () => screen.queryByRole('dialog', { name: 'ホーム画面に追加しましょう' })

beforeEach(() => { localStorage.clear(); loadDraft.mockReturnValue(null) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('add to home screen guide', () => {
  it('shows iPhone steps once right after sign-up, including signing in from the icon', async () => {
    device(IPHONE)
    markSignedUp('u1')
    renderGate()
    expect(sheet()).toHaveTextContent('ホーム画面に追加')
    expect(sheet()).toHaveTextContent('同じメールアドレスでログイン')
    await userEvent.click(screen.getByRole('button', { name: 'あとで' }))
    expect(sheet()).toBeNull()
    expect(localStorage.getItem('glog:install-after-signup:u1')).toBeNull()
  })
  it('asks once more after the first finished workout, then not again', async () => {
    device(IPHONE)
    renderGate()
    expect(sheet()).toBeNull()
    act(() => markWorkoutFinished('u1'))
    expect(sheet()).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'あとで' }))
    act(() => markWorkoutFinished('u1'))
    expect(sheet()).toBeNull()
  })
  it('waits until recording is over', () => {
    device(IPHONE)
    markSignedUp('u1')
    renderGate('/log')
    expect(sheet()).toBeNull()
  })
  it('opens from the home card at any time, and the card can be closed', async () => {
    device(IPHONE)
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: '追加のしかた' }))
    expect(sheet()).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'あとで' }))
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('heading', { name: 'ホーム画面に追加' })).toBeNull()
    expect(localStorage.getItem('glog:install-card-dismissed:u1')).toBe('1')
  })
  it('asks LINE users to open the page in a browser first', () => {
    device(LINE)
    markSignedUp('u1')
    renderGate()
    expect(sheet()).toHaveTextContent('Safari')
    expect(screen.getByRole('link', { name: 'ブラウザーで開く' })).toHaveAttribute('href', expect.stringContaining('openExternalBrowser=1'))
  })
  it('shows nothing from the home screen icon or on a PC', () => {
    for (const [userAgent, standalone] of [[IPHONE, true], [PC, false]] as const) {
      device(userAgent, standalone)
      markSignedUp('u1')
      const { unmount } = render(<MemoryRouter><InstallGate /><InstallCard /></MemoryRouter>)
      act(() => openInstallGuide())
      expect(sheet()).toBeNull()
      expect(screen.queryByRole('heading', { name: 'ホーム画面に追加' })).toBeNull()
      unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals()
    }
  })
})
