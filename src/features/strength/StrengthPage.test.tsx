import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import { buildStrengthSnapshot } from './strengthSnapshot'
import { StrengthPage } from './StrengthPage'
const { saveCurrentGoal } = vi.hoisted(() => ({ saveCurrentGoal: vi.fn() }))
vi.mock('./currentGoal', async (original) => ({
  ...await original<typeof import('./currentGoal')>(), saveCurrentGoal,
}))

const { fetchStrengthSnapshot, fetchStrengthGoals, fetchExercises, saveBig3ExerciseMapping } = vi.hoisted(() => ({
  fetchStrengthSnapshot: vi.fn(), fetchStrengthGoals: vi.fn(), fetchExercises: vi.fn(), saveBig3ExerciseMapping: vi.fn(),
}))
vi.mock('./queries', () => ({
  fetchStrengthSnapshot, fetchStrengthGoals, saveBig3ExerciseMapping,
  createStrengthGoal: vi.fn(), deleteStrengthGoal: vi.fn(),
}))
vi.mock('../exercises/queries', () => ({ fetchExercises }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))
// Stand-in chart: shows the line's dot setting and lets a test tap the chart.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  LineChart: ({ children, data, onClick }: { children: React.ReactNode; data: { date: string }[]; onClick?: (state: { activeLabel: string }) => void }) =>
    <div>{children}<button type="button" onClick={() => onClick?.({ activeLabel: data[0].date })}>e1RMグラフ</button></div>,
  Line: ({ dot }: { dot: unknown }) => <span data-testid="e1rm-line-dot">{JSON.stringify(dot)}</span>,
  XAxis: () => null, YAxis: () => null, Tooltip: () => null, ReferenceLine: () => null,
}))

const exercises = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
  { id: 'conventional', name: 'コンベンショナルデッドリフト', name_normalized: 'コンベンショナルデッドリフト', is_preset: false },
]
const rows = [
  { exercise_id: 'squat', weight_kg: 180, reps: 1 },
  { exercise_id: 'bench', weight_kg: 100, reps: 1 },
  { exercise_id: 'deadlift', weight_kg: 200, reps: 1 },
  { exercise_id: 'conventional', weight_kg: 220, reps: 1 },
].flatMap((row) => [
  { ...row, performed_at: '2026-01-01T12:00:00Z' },
  // An older, lighter day per lift so each chart has the two points it needs to draw a line.
  { ...row, weight_kg: row.weight_kg - 10, performed_at: '2025-12-01T12:00:00Z' },
])
const initial = buildStrengthSnapshot(exercises, [], rows)
const mapped = buildStrengthSnapshot(exercises, [{ user_id: 'u1', lift_type: 'deadlift', exercise_id: 'conventional' }], rows)

function renderPage() {
  return render(<MemoryRouter><ToastProvider><StrengthPage /></ToastProvider></MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  fetchExercises.mockResolvedValue(exercises)
  fetchStrengthGoals.mockResolvedValue([])
  fetchStrengthSnapshot.mockResolvedValue(initial)
  saveBig3ExerciseMapping.mockResolvedValue(undefined)
})

describe('StrengthPage', () => {
  it('uses lifetime RM estimates for the total, breakdown and goal progress without singles', async () => {
    const multi = [
      { exercise_id: 'squat', weight_kg: 160, reps: 5 },
      { exercise_id: 'bench', weight_kg: 80, reps: 5 },
      { exercise_id: 'deadlift', weight_kg: 180, reps: 5 },
    ].map((row) => ({ ...row, performed_at: '2020-01-01T12:00:00Z' }))
    const snapshot = buildStrengthSnapshot(exercises, [], multi)
    expect(snapshot.prTotal).toBeNull()
    expect(snapshot.currentEstimatedTotal).toBeNull()
    fetchStrengthSnapshot.mockResolvedValue(snapshot)
    fetchStrengthGoals.mockResolvedValue([{ id: 'g1', user_id: 'u1', label: '目標', target_date: '2027-12-31', target_total_kg: 600, created_at: '2026-09-01' }])
    renderPage()
    const score = within(await screen.findByRole('region', { name: 'Big3スコア' }))
    for (const value of ['472.5', '180', '90', '202.5']) expect(score.getByText(value)).toBeInTheDocument()
    expect(score.getByText('127.5 kg')).toBeInTheDocument()
    expect(score.getByText('（78%）')).toBeInTheDocument()
  })
  it('edits one existing goal, preserves a failed input and retries', async () => {
    const goal = { id: 'g1', user_id: 'u1', label: '年内', target_date: '2026-12-31', target_total_kg: 600, created_at: '2026-09-01' }
    fetchStrengthGoals.mockResolvedValue([goal, { ...goal, id: 'old', created_at: '2025-01-01', target_total_kg: 700 }])
    saveCurrentGoal.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ...goal, target_total_kg: 550 })
    const user = userEvent.setup()
    renderPage()
    const score = await screen.findByRole('region', { name: 'Big3スコア' })
    expect(within(score).getByText(/120 kg/)).toBeInTheDocument()
    expect(screen.queryByText('目標を追加')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '目標を変更' }))
    const total = screen.getByLabelText('目標の合計重量（kg）')
    expect(total).toHaveValue(600)
    await user.clear(total); await user.type(total, '550')
    await user.click(screen.getByRole('button', { name: '目標を保存' }))
    await screen.findByRole('alert')
    expect(total).toHaveValue(550)
    await user.click(screen.getByRole('button', { name: '目標を保存' }))
    expect(await screen.findByText('目標 550 kg')).toBeInTheDocument()
    expect(saveCurrentGoal).toHaveBeenLastCalledWith(expect.objectContaining({ existing: goal, targetTotalKg: 550 }))
    await user.click(screen.getByRole('button', { name: '目標を変更' }))
    expect(screen.getByLabelText('目標の合計重量（kg）')).toHaveValue(550)
  })
  it('shows goal achieved without switching to an older goal', async () => {
    fetchStrengthGoals.mockResolvedValue([{ id: 'g1', user_id: 'u1', label: '目標', target_date: '2026-12-31', target_total_kg: 400, created_at: '2026-09-01' }])
    renderPage()
    expect(await screen.findByText('目標達成！')).toBeInTheDocument()
    expect(screen.getByText('目標 400 kg')).toBeInTheDocument()
  })
  it('does not present missing records as a zero score', async () => {
    fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot(exercises, [], []))
    renderPage()
    expect(await screen.findByText('3種目の1〜10回の記録がそろうと合計を表示します')).toBeInTheDocument()
    expect(screen.queryByText('目標達成！')).not.toBeInTheDocument()
  })
  it('shows metrics without exercise mapping controls or a catalog request', async () => {
    renderPage()
    expect(await screen.findByText('480')).toBeInTheDocument()
    expect(screen.queryByText('Big3の対象種目')).not.toBeInTheDocument()
    expect(screen.queryByText('Rep PR')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('e1rm-line-dot').map((el) => el.textContent)).toEqual(['false', 'false', 'false'])
    expect(fetchExercises).not.toHaveBeenCalled()
  })
  it('preserves existing mapped calculations', async () => {
    fetchStrengthSnapshot.mockResolvedValue(mapped)
    renderPage()
    expect(await screen.findByText('500')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /詳細/ })).not.toBeInTheDocument()
    expect(screen.getByText('コンベンショナルデッドリフト')).toBeInTheDocument()
    expect(saveBig3ExerciseMapping).not.toHaveBeenCalled()
  })
  it('opens the exercise detail when a lift chart is tapped, without showing day records here', async () => {
    fetchStrengthSnapshot.mockResolvedValue(mapped)
    function Detail() { return <p>種目詳細: {useParams().exerciseId}</p> }
    render(<MemoryRouter initialEntries={['/big3']}><ToastProvider><Routes>
      <Route path="/big3" element={<StrengthPage />} />
      <Route path="/exercises/:exerciseId" element={<Detail />} />
    </Routes></ToastProvider></MemoryRouter>)
    const charts = await screen.findAllByRole('button', { name: 'e1RMグラフ' })
    await userEvent.click(charts[2])
    expect(await screen.findByText('種目詳細: conventional')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '選択日の種目の記録' })).not.toBeInTheDocument()
  })
  it('recovers from a load failure using retry', async () => {
    fetchStrengthSnapshot.mockRejectedValueOnce(new Error('network'))
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: '再試行' }))
    expect(await screen.findByText('480')).toBeInTheDocument()
  })
})
