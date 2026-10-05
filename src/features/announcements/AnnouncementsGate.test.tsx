import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Announcement } from './announcements'

const { fetchSeenUntil, markAnnouncementsSeen, loadDraft } = vi.hoisted(() => ({ fetchSeenUntil: vi.fn(), markAnnouncementsSeen: vi.fn(), loadDraft: vi.fn() }))
vi.mock('./queries', () => ({ fetchSeenUntil, markAnnouncementsSeen }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('../workout-log/persistence', () => ({ loadDraft }))
import { AnnouncementsGate } from './AnnouncementsGate'

// jsdom does not implement the modal top layer.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})

const items: Announcement[] = [
  { id: 'a', publishedAt: '2026-10-01T12:00:00+09:00', title: '古い機能', body: '古い説明' },
  { id: 'b', publishedAt: '2026-10-05T12:00:00+09:00', title: 'ご意見ボックス', body: '運営に送れます', link: { to: '/feedback', label: 'ご意見を送る' } },
]
function renderGate(path = '/') {
  render(<MemoryRouter initialEntries={[path]}>
    <AnnouncementsGate items={items} />
    <Routes>
      <Route path="/" element={<p>ホーム画面</p>} />
      <Route path="/log" element={<Link to="/">記録を終える</Link>} />
      <Route path="/feedback" element={<p>送信画面</p>} />
    </Routes>
  </MemoryRouter>)
}
const flush = () => act(async () => {})
beforeEach(() => {
  vi.clearAllMocks()
  fetchSeenUntil.mockResolvedValue('2026-09-01T00:00:00Z')
  markAnnouncementsSeen.mockResolvedValue(undefined)
  loadDraft.mockReturnValue(null)
})

it('shows every unread announcement in one sheet, newest first', async () => {
  renderGate(); await flush()
  expect(screen.getByRole('dialog', { name: '新しい機能' })).toBeInTheDocument()
  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  expect(titles).toEqual(['ご意見ボックス', '古い機能'])
})

it('marks them seen and closes without waiting for the save', async () => {
  markAnnouncementsSeen.mockReturnValue(new Promise(() => {}))
  renderGate(); await flush()
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(markAnnouncementsSeen).toHaveBeenCalledOnce()
})

it('opens the feature from its button', async () => {
  renderGate(); await flush()
  await userEvent.click(screen.getByRole('button', { name: 'ご意見を送る' }))
  expect(screen.getByText('送信画面')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(markAnnouncementsSeen).toHaveBeenCalledOnce()
})

it('ignores a failed save', async () => {
  markAnnouncementsSeen.mockRejectedValue(new Error('offline'))
  renderGate(); await flush()
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows nothing when everything was seen, the baseline is missing, or loading fails', async () => {
  fetchSeenUntil.mockResolvedValueOnce('2026-10-06T00:00:00Z')
  const first = render(<MemoryRouter><AnnouncementsGate items={items} /></MemoryRouter>); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  first.unmount()
  fetchSeenUntil.mockResolvedValueOnce(null)
  const second = render(<MemoryRouter><AnnouncementsGate items={items} /></MemoryRouter>); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  second.unmount()
  fetchSeenUntil.mockRejectedValueOnce(new Error('offline'))
  render(<MemoryRouter><AnnouncementsGate items={items} /></MemoryRouter>); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('waits while recording and shows once the recording screen is left', async () => {
  renderGate('/log'); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: '記録を終える' }))
  expect(screen.getByRole('dialog', { name: '新しい機能' })).toBeInTheDocument()
})

it('waits while a draft has sets, even off the recording screen', async () => {
  loadDraft.mockReturnValue({ state: { sets: [{ id: 's1' }] } })
  renderGate(); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(loadDraft).toHaveBeenCalledWith('me')
})
