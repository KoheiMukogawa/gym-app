import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AdminReport } from './queries'

const { fetchReports, resolveReport } = vi.hoisted(() => ({ fetchReports: vi.fn(), resolveReport: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./queries', async (original) => ({ ...await original<typeof import('./queries')>(), fetchReports, resolveReport }))
import { AdminReportsPage } from './AdminReportsPage'

const open: AdminReport = {
  id: 'r1', created_at: '2026-11-06T00:30:00Z', reason: 'bio', detail: 'ひとことが不快です',
  snapshot: { display_name: 'ベンチ太郎', icon: 'initials', bio: '昔のひとこと' }, resolved_at: null, resolution: null,
  reporter_name: '通報した人', target_id: 't1', target_name: 'ベンチ次郎', target_icon: 'initials', target_bio: '今のひとこと', target_global: true,
}
const done: AdminReport = { ...open, id: 'r2', target_id: 't2', resolved_at: '2026-11-05T00:00:00Z', resolution: 'dismissed', detail: '' }
const renderPage = () => render(<MemoryRouter><AdminReportsPage /></MemoryRouter>)
const row = (text: string) => screen.getByText(text).closest('li')!

beforeEach(() => {
  vi.clearAllMocks()
  fetchReports.mockResolvedValue([open, done])
  resolveReport.mockResolvedValue(1)
})

describe('AdminReportsPage', () => {
  it('shows what was reported next to the current profile, and the open count', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '届いた通報' })).toBeInTheDocument()
    expect(screen.getByText(/未対応 1件/)).toBeInTheDocument()
    const item = row('ひとことが不快です')
    expect(within(item).getByText('不適切なひとこと')).toBeInTheDocument()
    expect(within(item).getByText('ベンチ太郎')).toBeInTheDocument()
    expect(within(item).getByText('ひとこと: 昔のひとこと')).toBeInTheDocument()
    expect(within(item).getByText('ベンチ次郎')).toBeInTheDocument()
    expect(within(item).getByText('今（全体ランキングに参加中）')).toBeInTheDocument()
    expect(screen.getByText(/対応済み: 問題なし/)).toBeInTheDocument()
  })

  it('dismisses at once, but asks before changing someone’s profile', async () => {
    renderPage()
    const item = row(await screen.findByText('ひとことが不快です').then((el) => el.textContent!))
    await userEvent.click(within(item).getByRole('button', { name: 'プロフィールを初期化' }))
    expect(resolveReport).not.toHaveBeenCalled()
    expect(within(item).getByText(/名前を「Glogユーザー」/)).toBeInTheDocument()
    await userEvent.click(within(item).getByRole('button', { name: 'キャンセル' }))
    await userEvent.click(within(item).getByRole('button', { name: 'ランキングから外す' }))
    await userEvent.click(within(item).getByRole('button', { name: '外す' }))
    expect(resolveReport).toHaveBeenCalledWith('t1', 'remove')
    expect(fetchReports).toHaveBeenCalledTimes(2)
  })

  it('resolves “no problem” without a confirmation and keeps errors on the row', async () => {
    resolveReport.mockRejectedValueOnce({ message: '未対応の通報が見つかりません' })
    renderPage()
    const item = row(await screen.findByText('ひとことが不快です').then((el) => el.textContent!))
    await userEvent.click(within(item).getByRole('button', { name: '問題なし' }))
    expect(resolveReport).toHaveBeenCalledWith('t1', 'dismiss')
    expect(await within(item).findByRole('alert')).toHaveTextContent('未対応の通報が見つかりません')
  })

  it('shows a load failure with a retry', async () => {
    fetchReports.mockRejectedValueOnce({ message: '権限がありません' })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('権限がありません')
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByRole('heading', { name: '届いた通報' })).toBeInTheDocument()
  })
})
