import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildStrengthSnapshot } from './strengthSnapshot'

const m = vi.hoisted(() => ({ fetchStrengthSnapshot: vi.fn(), saveStartingBests: vi.fn(), show: vi.fn(), invalidateMonthWorkouts: vi.fn() }))
vi.mock('./queries', () => ({ fetchStrengthSnapshot: m.fetchStrengthSnapshot }))
vi.mock('./startingBestsQueries', async (original) => ({ ...await original<typeof import('./startingBestsQueries')>(), saveStartingBests: m.saveStartingBests }))
vi.mock('../history/useMonthWorkouts', () => ({ invalidateMonthWorkouts: m.invalidateMonthWorkouts }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ show: m.show }) }))
import { StartingBestsPage } from './StartingBestsPage'

const EXERCISES = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
]
function open() {
  return render(<MemoryRouter initialEntries={['/big3/start']}><Routes>
    <Route path="/big3/start" element={<StartingBestsPage />} />
    <Route path="/big3" element={<p>BIG3画面</p>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.resetAllMocks()
  m.fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot(EXERCISES, [], []))
  m.saveStartingBests.mockResolvedValue(undefined)
})

describe('StartingBestsPage', () => {
  it('saves only the lifts entered, on the chosen date, then shows BIG3', async () => {
    open()
    await userEvent.type(await screen.findByLabelText('スクワットの重量'), '140')
    await userEvent.type(screen.getByLabelText('ベンチプレスの重量'), '100')
    await userEvent.clear(screen.getByLabelText('ベンチプレスの回数'))
    await userEvent.type(screen.getByLabelText('ベンチプレスの回数'), '5')
    expect(screen.getByText('2種目の合計')).toBeInTheDocument()
    expect(screen.getByText('252.5')).toBeInTheDocument()
    const date = screen.getByLabelText('いつ頃の記録？')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-09-01')
    await userEvent.click(screen.getByRole('button', { name: 'BIG3を登録' }))
    expect(m.saveStartingBests).toHaveBeenCalledWith('u1', '2026-09-01', [
      { lift: 'squat', exerciseId: 'squat', weightKg: 140, reps: 1 },
      { lift: 'bench', exerciseId: 'bench', weightKg: 100, reps: 5 },
    ], expect.objectContaining({ workoutId: expect.any(String) }))
    expect(await screen.findByText('BIG3画面')).toBeInTheDocument()
    expect(m.show).toHaveBeenCalledWith('BIG3を登録しました')
    expect(m.invalidateMonthWorkouts).toHaveBeenCalled()
  })

  it('cannot save with nothing entered or with an invalid row', async () => {
    open()
    const save = await screen.findByRole('button', { name: 'BIG3を登録' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('デッドリフトの重量'), '200')
    await userEvent.clear(screen.getByLabelText('デッドリフトの回数'))
    await userEvent.type(screen.getByLabelText('デッドリフトの回数'), '12')
    expect(screen.getByText(/11回以上は推定の誤差が大きいため使えません/)).toBeInTheDocument()
    expect(save).toBeDisabled()
  })

  it('keeps the input and the same IDs when saving fails, and saves on retry', async () => {
    m.saveStartingBests.mockRejectedValueOnce(new Error('通信できませんでした'))
    open()
    await userEvent.type(await screen.findByLabelText('ベンチプレスの重量'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'BIG3を登録' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました。もう一度お試しください。')
    expect(screen.getByLabelText('ベンチプレスの重量')).toHaveValue('100')
    await userEvent.click(screen.getByRole('button', { name: 'BIG3を登録' }))
    expect(await screen.findByText('BIG3画面')).toBeInTheDocument()
    const [first, second] = m.saveStartingBests.mock.calls
    expect(second[3]).toBe(first[3])
  })

  it('shows a load failure with a retry instead of empty rows', async () => {
    m.fetchStrengthSnapshot.mockRejectedValueOnce(new Error('読み込めませんでした'))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました。もう一度お試しください。')
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByLabelText('スクワットの重量')).toBeInTheDocument()
  })

  it('points to the BIG3 settings for a lift without an exercise', async () => {
    m.fetchStrengthSnapshot.mockResolvedValue(buildStrengthSnapshot(EXERCISES.filter((e) => e.id !== 'deadlift'), [], []))
    open()
    expect(await screen.findByRole('link', { name: 'BIG3の設定で種目を選んでください' })).toHaveAttribute('href', '/big3')
    expect(screen.queryByLabelText('デッドリフトの重量')).not.toBeInTheDocument()
  })

  it('says a failed save is a save failure, not a problem with the numbers', async () => {
    m.saveStartingBests.mockRejectedValueOnce(new Error('offline'))
    open()
    await userEvent.type(await screen.findByLabelText('ベンチプレスの重量'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'BIG3を登録' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/^保存できませんでした。/)
  })

  it('ties each row error to its field for screen readers', async () => {
    open()
    const weight = await screen.findByLabelText('デッドリフトの重量')
    await userEvent.type(weight, '200')
    await userEvent.clear(screen.getByLabelText('デッドリフトの回数'))
    await userEvent.type(screen.getByLabelText('デッドリフトの回数'), '12')
    expect(weight).toHaveAttribute('aria-invalid', 'true')
    expect(weight).toHaveAccessibleDescription(/11回以上は推定の誤差が大きいため使えません/)
    expect(screen.getByLabelText('スクワットの重量')).not.toHaveAttribute('aria-invalid')
  })
})
