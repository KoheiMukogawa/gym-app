import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { fetchAllFeedback, markFeedbackRead, replyFeedback } = vi.hoisted(() => ({ fetchAllFeedback: vi.fn(), markFeedbackRead: vi.fn(), replyFeedback: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./queries', async (original) => ({ ...await original<typeof import('./queries')>(), fetchAllFeedback, markFeedbackRead, replyFeedback }))
import { AdminFeedbackPage } from './AdminFeedbackPage'

const noAnswer = { status: null, reply: null, replied_at: null }
const fresh = { ...noAnswer, id: 'f1', body: '記録画面が重い\n特に夜', user_agent: 'TestAgent/1.0', created_at: '2026-10-05T00:30:00Z', read_at: null, display_name: '利用者A' }
const old = { ...noAnswer, id: 'f2', body: 'ありがとう', user_agent: null, created_at: '2026-10-01T00:00:00Z', read_at: '2026-10-02T00:00:00Z', display_name: '利用者B' }
const renderPage = () => render(<MemoryRouter><AdminFeedbackPage /></MemoryRouter>)
const row = (text: string) => screen.getByText(text, { exact: false }).closest('li')!

beforeEach(() => {
  vi.clearAllMocks()
  fetchAllFeedback.mockResolvedValue([fresh, old])
})

describe('AdminFeedbackPage', () => {
  it('lists every note with the sender, time and browser, and counts the unread', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '届いた意見' })).toBeInTheDocument()
    expect(screen.getByText('未読 1件')).toBeInTheDocument()
    const first = row('記録画面が重い')
    expect(within(first).getByText('利用者A')).toBeInTheDocument()
    expect(within(first).getByText('10/5 9:30')).toBeInTheDocument()
    expect(within(first).getByText('TestAgent/1.0')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: '既読にする' })).toBeInTheDocument()
    expect(within(row('ありがとう')).queryByRole('button', { name: '既読にする' })).not.toBeInTheDocument()
    expect(within(row('ありがとう')).getByText('既読')).toBeInTheDocument()
  })

  it('answers a note with a status and a reply, which also marks it read', async () => {
    replyFeedback.mockResolvedValue('2026-10-13T00:00:00Z')
    renderPage()
    await screen.findByRole('heading', { name: '届いた意見' })
    const first = row('記録画面が重い')
    const send = within(first).getByRole('button', { name: '返信する' })
    expect(send).toBeDisabled() // a status is required
    await userEvent.click(within(first).getByRole('button', { name: '対応中' }))
    await userEvent.type(within(first).getByLabelText(/返信/), '調査しています')
    await userEvent.click(send)
    expect(replyFeedback).toHaveBeenCalledWith('f1', 'in_progress', '調査しています')
    expect(await within(first).findByText(/返信済み/)).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: '返信を更新' })).toBeDisabled()
    expect(screen.getByText('未読 0件')).toBeInTheDocument()
  })

  it('keeps the answer and shows why when saving fails', async () => {
    replyFeedback.mockRejectedValue(new Error('返信は1000文字までです'))
    renderPage()
    await screen.findByRole('heading', { name: '届いた意見' })
    const first = row('記録画面が重い')
    await userEvent.click(within(first).getByRole('button', { name: '対応済み' }))
    await userEvent.type(within(first).getByLabelText(/返信/), '直しました')
    await userEvent.click(within(first).getByRole('button', { name: '返信する' }))
    expect(await within(first).findByRole('alert')).toHaveTextContent('返信は1000文字までです')
    expect(within(first).getByLabelText(/返信/)).toHaveValue('直しました')
  })

  it('marks a note read once even when tapped twice', async () => {
    let finish: () => void = () => {}
    markFeedbackRead.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '既読にする' }))
    await userEvent.click(screen.getByRole('button', { name: '既読にしています…' }))
    finish()
    expect(await screen.findByText('未読 0件')).toBeInTheDocument()
    expect(markFeedbackRead).toHaveBeenCalledTimes(1)
    expect(markFeedbackRead).toHaveBeenCalledWith('f1')
    expect(within(row('記録画面が重い')).getByText('既読')).toBeInTheDocument()
  })

  it('tells the header to refresh its new count after marking, but not after a failure', async () => {
    const heard = vi.fn()
    window.addEventListener('glog-feedback-read', heard)
    markFeedbackRead.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '既読にする' }))
    await within(row('記録画面が重い')).findByRole('alert')
    expect(heard).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '既読にする' }))
    await screen.findByText('未読 0件')
    expect(heard).toHaveBeenCalledOnce()
    window.removeEventListener('glog-feedback-read', heard)
  })

  it('shows a failed mark in the row and lets it be tried again', async () => {
    markFeedbackRead.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '既読にする' }))
    expect(await within(row('記録画面が重い')).findByRole('alert')).toHaveTextContent('エラーが発生しました。もう一度お試しください。')
    expect(screen.getByRole('button', { name: '既読にする' })).toBeEnabled()
    expect(screen.getByText('未読 1件')).toBeInTheDocument()
  })

  it('shows the permission error with a retry', async () => {
    fetchAllFeedback.mockRejectedValueOnce({ message: '権限がありません' })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('権限がありません')
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('未読 1件')).toBeInTheDocument()
  })

  it('says so when nothing has arrived', async () => {
    fetchAllFeedback.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('まだ意見は届いていません')).toBeInTheDocument()
  })
})
