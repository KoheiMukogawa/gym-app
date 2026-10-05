import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

const { mounted, loadDraft, fetchIsAdmin, fetchUnreadFeedbackCount } = vi.hoisted(() => ({ mounted: vi.fn(), loadDraft: vi.fn(), fetchIsAdmin: vi.fn(), fetchUnreadFeedbackCount: vi.fn() }))
vi.mock('../features/auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1', profile: null, refreshProfile: vi.fn(), signOut: vi.fn() }) }))
vi.mock('../features/workout-log/persistence', () => ({ loadDraft }))
vi.mock('../features/feedback/queries', () => ({ fetchIsAdmin, fetchUnreadFeedbackCount }))
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
beforeEach(() => { vi.clearAllMocks(); loadDraft.mockReturnValue(null); fetchIsAdmin.mockResolvedValue(false) })
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

describe('feedback in the profile menu', () => {
  const flush = () => act(async () => {})
  it('hides the usage page from users', async () => {
    renderShell(); await flush()
    await userEvent.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    expect(screen.queryByRole('link', { name: '利用状況' })).not.toBeInTheDocument()
  })
  it('shows the usage page link to an admin', async () => {
    fetchIsAdmin.mockResolvedValue(true); fetchUnreadFeedbackCount.mockResolvedValue(0)
    renderShell(); await flush()
    await userEvent.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    expect(screen.getByRole('link', { name: '利用状況' })).toHaveAttribute('href', '/admin/usage')
  })
  it('offers everyone the feedback form without marking the icon', async () => {
    renderShell(); await flush()
    expect(screen.getByRole('button', { name: 'プロフィールメニュー' })).not.toHaveAttribute('data-unread')
    await userEvent.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    expect(screen.getByRole('link', { name: 'ご意見・不具合を送る' })).toHaveAttribute('href', '/feedback')
    expect(screen.queryByRole('link', { name: /届いた意見/ })).not.toBeInTheDocument()
  })
  it('rings the icon and shows the count to an admin with new notes', async () => {
    fetchIsAdmin.mockResolvedValue(true); fetchUnreadFeedbackCount.mockResolvedValue(3)
    renderShell(); await flush()
    const button = screen.getByRole('button', { name: 'プロフィールメニュー（新着の意見があります）' })
    expect(button).toHaveAttribute('data-unread')
    await userEvent.click(button)
    const link = screen.getByRole('link', { name: /届いた意見/ })
    expect(link).toHaveAttribute('href', '/admin/feedback')
    expect(link).toHaveTextContent('新着 3')
  })
  it('shows an admin the list without a ring when nothing is new', async () => {
    fetchIsAdmin.mockResolvedValue(true); fetchUnreadFeedbackCount.mockResolvedValue(0)
    renderShell(); await flush()
    const button = screen.getByRole('button', { name: 'プロフィールメニュー' })
    expect(button).not.toHaveAttribute('data-unread')
    await userEvent.click(button)
    expect(screen.getByRole('link', { name: '届いた意見' })).toBeInTheDocument()
  })
  it('drops the ring once the notes are read', async () => {
    fetchIsAdmin.mockResolvedValue(true); fetchUnreadFeedbackCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
    renderShell(); await flush()
    expect(screen.getByRole('button', { name: 'プロフィールメニュー（新着の意見があります）' })).toBeInTheDocument()
    act(() => { window.dispatchEvent(new Event('glog-feedback-read')) }); await flush()
    expect(screen.getByRole('button', { name: 'プロフィールメニュー' })).not.toHaveAttribute('data-unread')
  })
})
