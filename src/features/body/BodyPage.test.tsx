import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BodyPage } from './BodyPage'

const { fetchBodyweightLogs, saveBodyComposition, deleteBodyLog } = vi.hoisted(() => ({
  fetchBodyweightLogs: vi.fn(), saveBodyComposition: vi.fn(), deleteBodyLog: vi.fn(),
}))
vi.mock('../profile/bodyweightQueries', async (original) => ({
  ...await original<typeof import('../profile/bodyweightQueries')>(),
  fetchBodyweightLogs, saveBodyComposition, deleteBodyLog,
}))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  LineChart: ({ data }: { data: unknown }) => <div data-testid="trend-points">{JSON.stringify(data)}</div>,
  Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))

const today = new Date().toLocaleDateString('sv-SE')
const previousDay = new Date(today + 'T12:00:00')
previousDay.setDate(previousDay.getDate() - 1)
const pastDate = previousDay.toLocaleDateString('sv-SE')
const renderPage = async () => {
  render(<MemoryRouter><BodyPage /></MemoryRouter>)
  await waitFor(() => expect(fetchBodyweightLogs).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryAllByRole('status', { name: '読み込み中' })).toHaveLength(0))
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchBodyweightLogs.mockResolvedValue([])
  saveBodyComposition.mockImplementation(async (_u: string, i: { date?: string; bodyweightKg: number; bodyFatPct: number | null }) =>
    ({ recorded_on: i.date ?? today, bodyweight_kg: i.bodyweightKg, body_fat_pct: i.bodyFatPct }))
})

describe('BodyPage', () => {
  it('records weight and body fat for today', async () => {
    await renderPage()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '70.2')
    await userEvent.type(screen.getByLabelText('体脂肪率（%）'), '15.4')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { bodyweightKg: 70.2, bodyFatPct: 15.4 }))
    expect(await within(screen.getByRole('region', { name: '最近の記録' })).findByText(/70\.2/)).toBeInTheDocument()
  })

  it('records weight alone when body fat is left empty', async () => {
    await renderPage()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '70')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { bodyweightKg: 70, bodyFatPct: null }))
  })

  it('refuses a weight outside the allowed range', async () => {
    await renderPage()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '5')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('体重')
    expect(saveBodyComposition).not.toHaveBeenCalled()
  })

  it('prefills the latest values so an unchanged day is one tap', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: pastDate, bodyweight_kg: 69.8, body_fat_pct: 16 }])
    await renderPage()
    expect(await screen.findByLabelText('体重（kg）')).toHaveValue(69.8)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(16)
  })

  it('edits a past day when its row is tapped', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: pastDate, bodyweight_kg: 69.8, body_fat_pct: 16 }])
    await renderPage()
    await userEvent.click(await screen.findByRole('button', { name: pastDate + ' の記録を修正' }))
    expect(screen.getByRole('region', { name: '記録の入力' })).toHaveTextContent(pastDate)

    const weight = screen.getByLabelText('体重（kg）')
    await userEvent.clear(weight)
    await userEvent.type(weight, '69.5')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { date: pastDate, bodyweightKg: 69.5, bodyFatPct: 16 }))
    // 保存したら今日の入力に戻る
    expect(screen.getByRole('region', { name: '記録の入力' })).toHaveTextContent('今日')
  })

  it('keeps a retryable error on screen when loading fails', async () => {
    fetchBodyweightLogs.mockRejectedValue(new Error('network'))
    await renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
    expect(screen.queryByText('まだ記録がありません')).not.toBeInTheDocument()
    expect(screen.queryByText('この期間の記録はありません')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '記録する' })).toBeDisabled()
    fetchBodyweightLogs.mockResolvedValue([])
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('まだ記録がありません')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('restores latest values when cancelling or saving a past edit', async () => {
    fetchBodyweightLogs.mockResolvedValue([
      { recorded_on: pastDate, bodyweight_kg: 69.8, body_fat_pct: 16 },
      { recorded_on: today, bodyweight_kg: 71, body_fat_pct: 17 },
    ])
    await renderPage()
    const past = await screen.findByRole('button', { name: pastDate + ' の記録を修正' })
    await userEvent.click(past)
    await userEvent.click(screen.getByRole('button', { name: '今日に戻る' }))
    expect(screen.getByLabelText('体重（kg）')).toHaveValue(71)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(17)
    await userEvent.click(past)
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(71))
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(17)
    expect(screen.getByRole('region', { name: '記録の入力' })).toHaveTextContent('今日')
  })

  it('includes preceding records in the seven-day average at the period boundary', async () => {
    const now = new Date(today + 'T12:00:00')
    const priorMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    const boundary = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), priorMonthDays), 12)
    const before = new Date(boundary)
    before.setDate(before.getDate() - 1)
    const date = boundary.toLocaleDateString('sv-SE')
    const earlier = before.toLocaleDateString('sv-SE')
    fetchBodyweightLogs.mockResolvedValue([
      { recorded_on: earlier, bodyweight_kg: 70, body_fat_pct: null },
      { recorded_on: date, bodyweight_kg: 72, body_fat_pct: 18 },
    ])
    await renderPage()
    const chart = await screen.findByTestId('trend-points')
    expect(JSON.parse(chart.textContent!)).toEqual([{ date, value: 72, average: 71 }])
    expect(screen.queryByRole('button', { name: earlier + ' の記録を修正' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '体脂肪率' }))
    expect(JSON.parse(chart.textContent!)).toEqual([{ date, value: 18, average: 18 }])
    await userEvent.click(screen.getByRole('button', { name: '3ヶ月' }))
    expect(screen.getByRole('button', { name: earlier + ' の記録を修正' })).toBeInTheDocument()
  })

  it('retains entries on failed deletion and removes them after retry', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: today, bodyweight_kg: 70, body_fat_pct: null }])
    deleteBodyLog.mockRejectedValueOnce(new Error('delete failed')).mockResolvedValue(undefined)
    await renderPage()
    const remove = await screen.findByRole('button', { name: today + ' の記録を削除' })
    await userEvent.click(remove)
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました')
    expect(screen.getByRole('button', { name: today + ' の記録を修正' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
    await userEvent.click(remove)
    await waitFor(() => expect(screen.queryByRole('button', { name: today + ' の記録を修正' })).not.toBeInTheDocument())
    expect(deleteBodyLog).toHaveBeenCalledWith('u1', today)
  })

  it('retains input and entries after a failed save', async () => {
    saveBodyComposition.mockRejectedValueOnce(new Error('save failed'))
    await renderPage()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '70')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました')
    expect(screen.getByLabelText('体重（kg）')).toHaveValue(70)
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByRole('status')).toHaveTextContent('記録しました')
  })

})

it('reloads externally synced records and exposes ancient graph and list', async () => {
  await renderPage()
  fetchBodyweightLogs.mockResolvedValue([{ recorded_on: '2015-01-02', bodyweight_kg: 65, body_fat_pct: 14 }])
  await userEvent.click(screen.getByRole('button', { name: '記録を再読み込み' }))
  await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(65))
  await userEvent.click(screen.getByRole('button', { name: '全期間' }))
  expect(JSON.parse(screen.getByTestId('trend-points').textContent!)).toEqual([{ date:'2015-01-02', value:65, average:65 }])
  expect(screen.getByRole('button', { name: '2015-01-02 の記録を修正' })).toBeInTheDocument()
})
it('shows all-period history in progressive batches and resets on period change', async () => {
  fetchBodyweightLogs.mockResolvedValue(Array.from({length:105},(_,i) => {
    const day=new Date('2015-01-01T12:00:00'); day.setDate(day.getDate()+i)
    return { recorded_on:day.toLocaleDateString('sv-SE'), bodyweight_kg:70, body_fat_pct:null }
  }))
  await renderPage(); await userEvent.click(screen.getByRole('button',{name:'全期間'}))
  const list=within(screen.getByRole('region',{name:'最近の記録'}))
  expect(list.getAllByRole('button',{name:/の記録を修正/})).toHaveLength(50)
  await userEvent.click(screen.getByRole('button',{name:'さらに50件表示'}))
  expect(list.getAllByRole('button',{name:/の記録を修正/})).toHaveLength(100)
  await userEvent.click(screen.getByRole('button',{name:'さらに50件表示'}))
  expect(list.getAllByRole('button',{name:/の記録を修正/})).toHaveLength(105)
  await userEvent.click(screen.getByRole('button',{name:'1ヶ月'}))
  await userEvent.click(screen.getByRole('button',{name:'全期間'}))
  expect(list.getAllByRole('button',{name:/の記録を修正/})).toHaveLength(50)
})
