import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { saveShowScreenIds } from '../features/admin/screenIds'

const { mounted, loadDraft, fetchIsAdmin, fetchUnreadFeedbackCount, fetchMyFeedback, markRepliesSeen } = vi.hoisted(() => ({ mounted: vi.fn(), loadDraft: vi.fn(), fetchIsAdmin: vi.fn(), fetchUnreadFeedbackCount: vi.fn(), fetchMyFeedback: vi.fn(), markRepliesSeen: vi.fn() }))
vi.mock('../features/auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1', profile: null, refreshProfile: vi.fn(), signOut: vi.fn() }) }))
vi.mock('../features/workout-log/persistence', () => ({ loadDraft }))
vi.mock('../features/feedback/queries', async (original) => ({ ...await original<typeof import('../features/feedback/queries')>(), fetchIsAdmin, fetchUnreadFeedbackCount, fetchMyFeedback, markRepliesSeen }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../features/announcements/queries', () => ({ fetchSeenUntil: vi.fn().mockResolvedValue(null), markAnnouncementsSeen: vi.fn() }))
vi.mock('../features/workout-log/LogPage', () => ({ LogPage: () => {
  const [text, setText] = useState(() => { mounted(); return '' })
  return <label>入力途中<input value={text} onChange={e => setText(e.target.value)} /></label>
} }))

// jsdom does not implement the modal top layer.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})

function renderShell(path = '/') {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell />}>
    <Route path="/" element={<Link to="/log">記録を開始</Link>} />
    <Route path="/log" element={null} />
    <Route path="/history" element={<Link to="/log">記録に戻る</Link>} />
  </Route></Routes></MemoryRouter>)
}
beforeEach(() => { vi.clearAllMocks(); loadDraft.mockReturnValue(null); fetchIsAdmin.mockResolvedValue(false); fetchMyFeedback.mockResolvedValue([]); markRepliesSeen.mockResolvedValue(undefined); saveShowScreenIds(false) })
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

describe('screen IDs', () => {
  it('lets an admin show the screen ID in the header and remembers it', async () => {
    fetchIsAdmin.mockResolvedValue(true); fetchUnreadFeedbackCount.mockResolvedValue(0)
    const user = userEvent.setup()
    renderShell('/history')
    await user.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    const toggle = await screen.findByRole('switch', { name: /画面IDを表示/ })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByLabelText(/^画面ID/)).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByLabelText('画面ID HIS-01')).toHaveTextContent('HIS-01')
    expect(localStorage.getItem('glog:show-screen-ids')).toBe('1')
  })
  it('never shows IDs or the switch to other users, even if the device remembers it', async () => {
    saveShowScreenIds(true)
    renderShell('/history')
    await userEvent.click(screen.getByRole('button', { name: 'プロフィールメニュー' }))
    await act(async () => {})
    expect(screen.queryByRole('switch', { name: /画面IDを表示/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^画面ID/)).not.toBeInTheDocument()
  })
})

describe('replies to my feedback', () => {
  const answered = { id: 'f1', body: '1kg刻みにしてほしい', created_at: '2026-10-12T00:00:00Z', read_at: '2026-10-12T01:00:00Z',
    status: 'done', reply: '1kg刻みに対応しました', replied_at: '2026-10-13T00:00:00Z', reply_seen_at: null }
  it('rings the icon, marks the menu, and shows the reply once in a sheet', async () => {
    fetchMyFeedback.mockResolvedValue([answered])
    const user = userEvent.setup()
    renderShell()
    const sheet = await screen.findByRole('dialog', { name: 'ご意見への返信' })
    expect(sheet).toHaveTextContent('対応済み')
    expect(sheet).toHaveTextContent('1kg刻みに対応しました')
    expect(screen.getByRole('button', { name: 'プロフィールメニュー（ご意見に返信があります）', hidden: true })).toHaveAttribute('data-unread')
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(markRepliesSeen).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'ご意見への返信' })).toBeNull()
  })
  it('waits while recording', async () => {
    fetchMyFeedback.mockResolvedValue([answered])
    renderShell('/log')
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: 'ご意見への返信' })).toBeNull()
  })
  it('stays quiet once the reply was seen', async () => {
    fetchMyFeedback.mockResolvedValue([{ ...answered, reply_seen_at: '2026-10-13T01:00:00Z' }])
    renderShell()
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: 'ご意見への返信' })).toBeNull()
    expect(screen.getByRole('button', { name: 'プロフィールメニュー' })).not.toHaveAttribute('data-unread')
  })
})
