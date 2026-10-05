import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'

const { fetchMyFeedback, sendFeedback } = vi.hoisted(() => ({ fetchMyFeedback: vi.fn(), sendFeedback: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./queries', async (original) => ({ ...await original<typeof import('./queries')>(), fetchMyFeedback, sendFeedback }))
import { FeedbackPage } from './FeedbackPage'

const read = { id: '1', body: 'グラフが見にくい', created_at: '2026-10-05T00:30:00Z', read_at: '2026-10-05T01:00:00Z' }
const unread = { id: '2', body: '種目を増やしたい', created_at: '2026-10-04T00:00:00Z', read_at: null }
const renderPage = () => render(<MemoryRouter><ToastProvider><FeedbackPage /></ToastProvider></MemoryRouter>)
const input = () => screen.getByLabelText('内容')

beforeEach(() => {
  vi.clearAllMocks()
  fetchMyFeedback.mockResolvedValue([read, unread])
})

describe('FeedbackPage', () => {
  it('explains who reads the notes and lists mine with the read mark', async () => {
    renderPage()
    expect(screen.getByText(/内容は運営だけが読み、ほかの利用者には表示されません/)).toBeInTheDocument()
    expect(screen.getByText(/ブラウザの情報（機種・OSの種類など）も一緒に送られます/)).toBeInTheDocument()
    expect(await screen.findByText('グラフが見にくい')).toBeInTheDocument()
    expect(screen.getByText('10/5 9:30 ・ 運営が確認済み')).toBeInTheDocument()
    expect(screen.getAllByText(/運営が確認済み/)).toHaveLength(1)
  })

  it('keeps the button disabled for blank text, including full-width spaces and newlines', async () => {
    renderPage()
    await screen.findByText('グラフが見にくい')
    const button = screen.getByRole('button', { name: '送信する' })
    expect(button).toBeDisabled()
    await userEvent.type(input(), '　 {enter}　')
    expect(button).toBeDisabled()
    await userEvent.type(input(), 'あ')
    expect(button).toBeEnabled()
    expect(screen.getByText(`残り${2000 - '　 \n　あ'.length}文字`)).toBeInTheDocument()
  })

  it('sends once even when tapped twice, then clears the text and adds it to the list', async () => {
    let finish: (value: typeof unread) => void = () => {}
    sendFeedback.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    renderPage()
    await screen.findByText('グラフが見にくい')
    await userEvent.type(input(), '休憩タイマーがほしい')
    await userEvent.click(screen.getByRole('button', { name: '送信する' }))
    expect(screen.getByRole('button', { name: '送信中…' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '送信中…' }))
    finish({ id: '3', body: '休憩タイマーがほしい', created_at: '2026-10-05T02:00:00Z', read_at: null })
    expect(await screen.findByText('送信しました。ありがとうございます')).toBeInTheDocument()
    expect(sendFeedback).toHaveBeenCalledTimes(1)
    expect(sendFeedback).toHaveBeenCalledWith('休憩タイマーがほしい')
    expect(input()).toHaveValue('')
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('休憩タイマーがほしい')).toBeInTheDocument()
  })

  it('keeps the text and shows the reason when sending fails', async () => {
    sendFeedback.mockRejectedValue({ message: '送信の上限に達しました。時間をおいてお試しください' })
    renderPage()
    await screen.findByText('グラフが見にくい')
    await userEvent.type(input(), 'もう一件')
    await userEvent.click(screen.getByRole('button', { name: '送信する' }))
    expect(await screen.findByText('送信の上限に達しました。時間をおいてお試しください')).toHaveAttribute('role', 'alert')
    expect(input()).toHaveValue('もう一件')
    expect(screen.getByRole('button', { name: '送信する' })).toBeEnabled()
  })

  it('shows a history error with a retry, and the form still works', async () => {
    fetchMyFeedback.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText('エラーが発生しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByText('まだ送った意見はありません')).not.toBeInTheDocument()
    expect(input()).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('グラフが見にくい')).toBeInTheDocument()
    expect(fetchMyFeedback).toHaveBeenCalledTimes(2)
  })

  it('says so when nothing has been sent yet', async () => {
    fetchMyFeedback.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('まだ送った意見はありません')).toBeInTheDocument()
  })
})
