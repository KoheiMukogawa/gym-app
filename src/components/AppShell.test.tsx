import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

const { mounted, loadDraft } = vi.hoisted(() => ({ mounted: vi.fn(), loadDraft: vi.fn() }))
vi.mock('../features/auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1', profile: null, refreshProfile: vi.fn(), signOut: vi.fn() }) }))
vi.mock('../features/workout-log/persistence', () => ({ loadDraft }))
vi.mock('../features/workout-log/LogPage', () => ({ LogPage: () => {
  const [text, setText] = useState(() => { mounted(); return '' })
  return <label>入力途中<input value={text} onChange={e => setText(e.target.value)} /></label>
} }))

function renderShell(path = '/') {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell />}>
    <Route path="/" element={<Link to="/log">記録を開始</Link>} />
    <Route path="/log" element={null} />
    <Route path="/history" element={<Link to="/log">記録に戻る</Link>} />
  </Route></Routes></MemoryRouter>)
}
beforeEach(() => { vi.clearAllMocks(); loadDraft.mockReturnValue(null) })
describe('deferred recording screen', () => {
  it('does not mount on home, and keeps input after tab navigation', async () => {
    const user = userEvent.setup()
    renderShell()
    expect(mounted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('link', { name: '記録を開始' }))
    await user.type(screen.getByLabelText('入力途中'), 'メモ途中')
    await user.click(screen.getByRole('link', { name: '履歴' }))
    expect(screen.getByLabelText('入力途中')).not.toBeVisible()
    await user.click(screen.getByRole('link', { name: '記録に戻る' }))
    expect(screen.getByLabelText('入力途中')).toHaveValue('メモ途中')
    expect(mounted).toHaveBeenCalledOnce()
  })
  it('mounts on a direct recording URL', () => {
    renderShell('/log')
    expect(screen.getByLabelText('入力途中')).toBeVisible()
    expect(mounted).toHaveBeenCalledOnce()
  })
  it('still resumes a saved draft on launch', async () => {
    loadDraft.mockReturnValue({ state: { sets: [{ id: 's1' }] } })
    renderShell()
    expect(await screen.findByLabelText('入力途中')).toBeVisible()
    expect(mounted).toHaveBeenCalledOnce()
  })
})

describe('profile menu', () => {
  it('links to the terms and the privacy policy', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    expect(screen.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy')
  })
})
