import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BodyPage } from './BodyPage'

const { session, fetchBodyweightLogs, saveBodyComposition, deleteBodyLog } = vi.hoisted(() => ({
  session: { userId: 'u1' as string | null },
  fetchBodyweightLogs: vi.fn(), saveBodyComposition: vi.fn(), deleteBodyLog: vi.fn(),
}))
vi.mock('../profile/bodyweightQueries', async (original) => ({
  ...await original<typeof import('../profile/bodyweightQueries')>(),
  fetchBodyweightLogs, saveBodyComposition, deleteBodyLog,
}))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => session }))

// Each plotted day becomes a button standing in for a tap on that day in the real chart.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  LineChart: ({ data, onClick }: { data: { date: string; weight: number | null }[]; onClick?: (state: { activeLabel: string }) => void }) => <>
    <div data-testid="trend-points">{JSON.stringify(data)}</div>
    {data.map((point) => <button key={point.date} type="button" aria-label={`${point.date} の記録を修正`}
      onClick={() => onClick?.({ activeLabel: point.date })}>{point.weight}</button>)}
  </>,
  Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))

const today = new Date().toLocaleDateString('sv-SE')
const previousDay = new Date(today + 'T12:00:00')
previousDay.setDate(previousDay.getDate() - 1)
const pastDate = previousDay.toLocaleDateString('sv-SE')
// jsdom does not implement the browser's modal top layer. Focus containment and
// backdrop interaction are covered by the mobile browser tests.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})
const openToday = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: '体重を記録' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: '体重を記録' }))
  await screen.findByRole('dialog', { name: '今日の記録' })
}
const renderPage = async () => {
  render(<MemoryRouter><BodyPage /></MemoryRouter>)
  await waitFor(() => expect(fetchBodyweightLogs).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryAllByRole('status', { name: '読み込み中' })).toHaveLength(0))
}

beforeEach(() => {
  vi.clearAllMocks()
  session.userId = 'u1'
  fetchBodyweightLogs.mockResolvedValue([])
  saveBodyComposition.mockImplementation(async (_u: string, i: { date?: string; bodyweightKg: number; bodyFatPct: number | null }) =>
    ({ recorded_on: i.date ?? today, bodyweight_kg: i.bodyweightKg, body_fat_pct: i.bodyFatPct }))
})

describe('BodyPage', () => {
  it('records weight and body fat for today', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: '体重を記録' }))
    expect(screen.getByLabelText('体重（kg）')).toHaveFocus()
    expect(screen.queryByRole('button', { name: '体重を記録' })).not.toBeInTheDocument()
    expect(saveBodyComposition).not.toHaveBeenCalled()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '70.2')
    await userEvent.type(screen.getByLabelText('体脂肪率（%）'), '15.4')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { bodyweightKg: 70.2, bodyFatPct: 15.4 }))
    expect(await within(screen.getByRole('region', { name: '最新の記録' })).findByLabelText(/^体重 70\.2kg/)).toBeInTheDocument()
  })

  it('records weight alone when body fat is left empty', async () => {
    await renderPage()
    await openToday()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '70')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { bodyweightKg: 70, bodyFatPct: null }))
  })

  it('refuses a weight outside the allowed range', async () => {
    await renderPage()
    await openToday()
    await userEvent.type(await screen.findByLabelText('体重（kg）'), '5')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('体重')
    expect(saveBodyComposition).not.toHaveBeenCalled()
  })

  it('keeps the sheet open while saving and closes it only after success', async () => {
    const pending = deferred<{ recorded_on: string; bodyweight_kg: number; body_fat_pct: null }>()
    saveBodyComposition.mockReturnValueOnce(pending.promise)
    await renderPage()
    await openToday()
    await userEvent.type(screen.getByLabelText('体重（kg）'), '70')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(screen.getByRole('button', { name: '入力を閉じる' })).toBeDisabled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => pending.resolve({ recorded_on: today, bodyweight_kg: 70, body_fat_pct: null }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('記録しました')
  })

  it('prefills the latest values so an unchanged day is one tap', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: pastDate, bodyweight_kg: 69.8, body_fat_pct: 16 }])
    await renderPage()
    await openToday()
    expect(await screen.findByLabelText('体重（kg）')).toHaveValue(69.8)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(16)
  })

  it('edits a past day tapped on the chart', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: pastDate, bodyweight_kg: 69.8, body_fat_pct: 16 }])
    await renderPage()
    await userEvent.click(await screen.findByRole('button', { name: pastDate + ' の記録を修正' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(pastDate.slice(5).replace('-', '/') + 'の記録')

    const weight = screen.getByLabelText('体重（kg）')
    await userEvent.clear(weight)
    await userEvent.type(weight, '69.5')
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))

    await waitFor(() => expect(saveBodyComposition).toHaveBeenCalledWith('u1', { date: pastDate, bodyweightKg: 69.5, bodyFatPct: 16 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await openToday()
    expect(screen.getByRole('dialog')).toHaveTextContent('今日')
  })

  it('dismisses a past entry without saving and opens today from the floating action', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: pastDate, bodyweight_kg: 69.8, body_fat_pct: 16 }])
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: pastDate + ' の記録を修正' }))
    await userEvent.click(screen.getByRole('button', { name: '入力を閉じる' }))
    await openToday()
    expect(screen.getByRole('dialog')).toHaveTextContent('今日の記録')
    expect(screen.getByLabelText('体重（kg）')).toHaveFocus()
    expect(saveBodyComposition).not.toHaveBeenCalled()
    await userEvent.tab()
    expect(screen.queryByRole('button', { name: '体重を記録' })).not.toBeInTheDocument()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '体重を記録' })).toHaveFocus())
  })

  it('keeps a retryable error on screen when loading fails', async () => {
    fetchBodyweightLogs.mockRejectedValue(new Error('network'))
    await renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
    expect(screen.queryByText('この期間の記録はありません')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '体重を記録' })).toBeDisabled()
    fetchBodyweightLogs.mockResolvedValue([])
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('この期間の記録はありません')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: '入力を閉じる' }))
    await openToday()
    expect(screen.getByLabelText('体重（kg）')).toHaveValue(71)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(17)
    await userEvent.click(screen.getByRole('button', { name: '入力を閉じる' }))
    await userEvent.click(past)
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await openToday()
    expect(screen.getByLabelText('体重（kg）')).toHaveValue(71)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(17)
    expect(screen.getByRole('dialog')).toHaveTextContent('今日')
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
    expect(JSON.parse(chart.textContent!)).toEqual([{ date, weight: 72, weightAverage: 71, fat: 18, fatAverage: 18 }])
    expect(screen.queryByRole('button', { name: earlier + ' の記録を修正' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '3ヶ月' }))
    expect(screen.getByRole('button', { name: earlier + ' の記録を修正' })).toBeInTheDocument()
  })

  it('uses the latest values as the chart legend, naming each axis', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: today, bodyweight_kg: 70, body_fat_pct: 15 }])
    await renderPage()
    const trend = screen.getByRole('region', { name: '推移' })
    expect(within(trend).queryByRole('button', { name: '体脂肪率' })).not.toBeInTheDocument()
    // The latest values live inside the chart section instead of a separate card above it.
    const legend = within(trend).getByRole('region', { name: '最新の記録' })
    expect(within(legend).getByLabelText('体重 70kg、前回比なし')).toHaveTextContent('左の目盛り')
    expect(within(legend).getByLabelText('体脂肪率 15%、前回比なし')).toHaveTextContent('右の目盛り')
    expect(within(trend).queryByText('体重（kg・左の目盛り）')).not.toBeInTheDocument()
  })

  it('summarizes the latest record in one row with changes for both metrics', async () => {
    fetchBodyweightLogs.mockResolvedValue([
      { recorded_on: pastDate, bodyweight_kg: 70, body_fat_pct: 16 },
      { recorded_on: today, bodyweight_kg: 70.2, body_fat_pct: 15.4 },
    ])
    await renderPage()
    const latest = screen.getByRole('region', { name: '最新の記録' })
    expect(within(latest).getByLabelText('体重 70.2kg、前回比 +0.2kg')).toBeInTheDocument()
    expect(within(latest).getByLabelText('体脂肪率 15.4%、前回比 -0.6%')).toBeInTheDocument()
    expect(within(latest).getByText(today.slice(5).replace('-', '/'))).toBeInTheDocument()
  })

  it('marks a missing body fat and a first record without inventing a change', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: today, bodyweight_kg: 70, body_fat_pct: null }])
    await renderPage()
    const latest = screen.getByRole('region', { name: '最新の記録' })
    expect(within(latest).getByLabelText('体重 70kg、前回比なし')).toBeInTheDocument()
    expect(within(latest).getByLabelText('体脂肪率 未記録')).toBeInTheDocument()
  })

  it('retains entries on failed deletion and removes them after retry', async () => {
    fetchBodyweightLogs.mockResolvedValue([{ recorded_on: today, bodyweight_kg: 70, body_fat_pct: null }])
    deleteBodyLog.mockRejectedValueOnce(new Error('delete failed')).mockResolvedValue(undefined)
    await renderPage()
    await openToday()
    await userEvent.click(await screen.findByRole('button', { name: today + ' の記録を削除' }))
    expect(deleteBodyLog).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: '削除する' })
    await userEvent.click(confirm)
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました')
    expect(screen.getByRole('button', { name: today + ' の記録を修正' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
    await userEvent.click(confirm)
    await waitFor(() => expect(screen.queryByRole('button', { name: today + ' の記録を修正' })).not.toBeInTheDocument())
    expect(deleteBodyLog).toHaveBeenCalledWith('u1', today)
  })

  it('retains input and entries after a failed save', async () => {
    saveBodyComposition.mockRejectedValueOnce(new Error('save failed'))
    await renderPage()
    await openToday()
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
  await openToday()
  await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(65))
  await userEvent.click(screen.getByRole('button', { name: '入力を閉じる' }))
  await userEvent.click(screen.getByRole('button', { name: '全期間' }))
  expect(JSON.parse(screen.getByTestId('trend-points').textContent!)).toEqual([{ date:'2015-01-02', weight:65, weightAverage:65, fat:14, fatAverage:14 }])
  expect(screen.getByRole('button', { name: '2015-01-02 の記録を修正' })).toBeInTheDocument()
})
it('removes the record list; past days are reached from the chart', async () => {
  fetchBodyweightLogs.mockResolvedValue([
    { recorded_on: pastDate, bodyweight_kg: 70, body_fat_pct: 16 },
    { recorded_on: today, bodyweight_kg: 71, body_fat_pct: 15 },
  ])
  await renderPage()
  expect(screen.queryByRole('region', { name: '最近の記録' })).not.toBeInTheDocument()
  expect(screen.getByText('グラフをタップすると、その日の記録を修正・削除できます。')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: pastDate + ' の記録を修正' }))
  const form = screen.getByRole('dialog')
  expect(within(form).getByRole('heading')).toHaveTextContent(pastDate.slice(5).replace('-', '/') + 'の記録')
  expect(screen.getByLabelText('体重（kg）')).toHaveValue(70)
  await userEvent.click(within(form).getByRole('button', { name: pastDate + ' の記録を削除' }))
  await userEvent.click(within(form).getByRole('button', { name: 'やめる' }))
  expect(deleteBodyLog).not.toHaveBeenCalled()
  await userEvent.click(within(form).getByRole('button', { name: pastDate + ' の記録を削除' }))
  await userEvent.click(within(form).getByRole('button', { name: '削除する' }))
  await waitFor(() => expect(deleteBodyLog).toHaveBeenCalledWith('u1', pastDate))
  await waitFor(() => expect(screen.queryByRole('button', { name: pastDate + ' の記録を修正' })).not.toBeInTheDocument())
  await openToday()
  expect(screen.getByLabelText('体重（kg）')).toHaveValue(71)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('BodyPage account changes', () => {
  const ownerARows = [
    { recorded_on: pastDate, bodyweight_kg: 69, body_fat_pct: 15 },
    { recorded_on: today, bodyweight_kg: 70, body_fat_pct: 16 },
  ]
  const ownerBRows = [{ recorded_on: today, bodyweight_kg: 81, body_fat_pct: 22 }]
  const page = () => <MemoryRouter><BodyPage /></MemoryRouter>

  it('clears the old owner inputs immediately and keeps them empty when the new fetch fails', async () => {
    const pending = deferred<typeof ownerBRows>()
    fetchBodyweightLogs.mockResolvedValueOnce(ownerARows).mockReturnValueOnce(pending.promise)
    const view = render(page())
    await openToday()
    await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(70))
    await userEvent.click(screen.getByRole('button', { name: '入力を閉じる' }))
    await userEvent.click(screen.getByRole('button', { name: pastDate + ' の記録を修正' }))

    session.userId = 'u2'
    view.rerender(page())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('体重（kg）')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('体脂肪率（%）')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: pastDate + ' の記録を修正' })).not.toBeInTheDocument()
    expect(fetchBodyweightLogs).toHaveBeenLastCalledWith('u2')

    await act(async () => pending.reject(new Error('owner B fetch failed')))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByLabelText('体重（kg）')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('体脂肪率（%）')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trend-points')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '体重を記録' })).toBeDisabled()
  })

  it('keeps the new owner data when the old owner save completes late', async () => {
    const pending = deferred<(typeof ownerARows)[number]>()
    fetchBodyweightLogs.mockResolvedValueOnce(ownerARows).mockResolvedValueOnce(ownerBRows)
    saveBodyComposition.mockReturnValueOnce(pending.promise)
    const view = render(page())
    await openToday()
    await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(70))
    await userEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(saveBodyComposition).toHaveBeenCalledWith('u1', { bodyweightKg: 70, bodyFatPct: 16 })

    session.userId = 'u2'
    view.rerender(page())
    await openToday()
    await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(81))
    await act(async () => pending.resolve({ recorded_on: today, bodyweight_kg: 71, body_fat_pct: 17 }))
    expect(screen.getByLabelText('体重（kg）')).toHaveValue(81)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(22)
    expect(JSON.parse(screen.getByTestId('trend-points').textContent!)).toEqual([{ date: today, weight: 81, weightAverage: 81, fat: 22, fatAverage: 22 }])
    expect(screen.queryByRole('button', { name: pastDate + ' の記録を修正' })).not.toBeInTheDocument()
    expect(screen.queryByText('記録しました')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '記録する' })).toBeEnabled()
  })

  it('keeps the new owner data when the old owner deletion completes late', async () => {
    const pending = deferred<void>()
    fetchBodyweightLogs.mockResolvedValueOnce(ownerARows).mockResolvedValueOnce(ownerBRows)
    deleteBodyLog.mockReturnValueOnce(pending.promise)
    const view = render(page())
    await openToday()
    await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(70))
    await userEvent.click(screen.getByRole('button', { name: today + ' の記録を削除' }))
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(deleteBodyLog).toHaveBeenCalledWith('u1', today)

    session.userId = 'u2'
    view.rerender(page())
    await openToday()
    await waitFor(() => expect(screen.getByLabelText('体重（kg）')).toHaveValue(81))
    await act(async () => pending.resolve())
    expect(screen.getByLabelText('体重（kg）')).toHaveValue(81)
    expect(screen.getByLabelText('体脂肪率（%）')).toHaveValue(22)
    expect(JSON.parse(screen.getByTestId('trend-points').textContent!)).toEqual([{ date: today, weight: 81, weightAverage: 81, fat: 22, fatAverage: 22 }])
    expect(screen.getByRole('button', { name: today + ' の記録を修正' })).toHaveTextContent('81')
    expect(screen.queryByRole('button', { name: pastDate + ' の記録を修正' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '記録する' })).toBeEnabled()
  })
})
