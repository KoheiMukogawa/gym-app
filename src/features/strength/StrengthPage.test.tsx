import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import { buildStrengthSnapshot } from './strengthSnapshot'
import { StrengthPage } from './StrengthPage'

const { fetchStrengthSnapshot, fetchStrengthGoals, fetchExercises, saveBig3ExerciseMapping } = vi.hoisted(() => ({
  fetchStrengthSnapshot: vi.fn(), fetchStrengthGoals: vi.fn(), fetchExercises: vi.fn(), saveBig3ExerciseMapping: vi.fn(),
}))
vi.mock('./queries', () => ({
  fetchStrengthSnapshot, fetchStrengthGoals, saveBig3ExerciseMapping,
  createStrengthGoal: vi.fn(), deleteStrengthGoal: vi.fn(),
}))
vi.mock('../exercises/queries', () => ({ fetchExercises }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

const exercises = [
  { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', is_preset: true },
  { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', is_preset: true },
  { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', is_preset: true },
  { id: 'narrow', name: 'ナロウデッド', name_normalized: 'ナロウデッド', is_preset: false },
]
const rows = [
  { exercise_id: 'squat', weight_kg: 180, reps: 1 },
  { exercise_id: 'bench', weight_kg: 100, reps: 1 },
  { exercise_id: 'deadlift', weight_kg: 200, reps: 1 },
  { exercise_id: 'narrow', weight_kg: 220, reps: 1 },
].map((row) => ({ ...row, performed_at: '2026-01-01T12:00:00Z' }))
const initial = buildStrengthSnapshot(exercises, [], rows)
const mapped = buildStrengthSnapshot(exercises, [{ user_id: 'u1', lift_type: 'deadlift', exercise_id: 'narrow' }], rows)

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

describe('StrengthPage exercise mappings', () => {
  it('shows defaults and allows any existing exercise for each lift', async () => {
    renderPage()
    const selectors = await screen.findAllByRole('combobox')
    expect(selectors).toHaveLength(3)
    for (const selector of selectors) {
      expect(selector).toHaveValue('')
      expect(selector).toHaveClass('min-h-14')
      expect(selector.querySelectorAll('option')).toHaveLength(exercises.length + 1)
    }
  })

  it('saves a selection and immediately refreshes totals and the exercise detail link', async () => {
    const user = userEvent.setup()
    renderPage()
    const selector = await screen.findByRole('combobox', { name: 'デッドリフトの対象種目' })
    expect(screen.getByText('480')).toBeInTheDocument()
    fetchStrengthSnapshot.mockResolvedValue(mapped)
    await user.selectOptions(selector, 'narrow')
    expect(saveBig3ExerciseMapping).toHaveBeenCalledWith('u1', 'deadlift', 'narrow')
    await waitFor(() => expect(selector).toHaveValue('narrow'))
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.queryByText('480')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /デッドリフト ナロウデッド/ })).toHaveAttribute('href', '/exercises/narrow')
  })

  it('restores preset calculations when the user selects the default option', async () => {
    const user = userEvent.setup()
    fetchStrengthSnapshot.mockResolvedValueOnce(mapped)
    renderPage()
    const selector = await screen.findByRole('combobox', { name: 'デッドリフトの対象種目' })
    expect(selector).toHaveValue('narrow')
    await user.selectOptions(selector, '')
    expect(saveBig3ExerciseMapping).toHaveBeenCalledWith('u1', 'deadlift', null)
    await waitFor(() => expect(selector).toHaveValue(''))
    expect(screen.getByText('480')).toBeInTheDocument()
  })

  it('keeps the saved selection and metrics when saving fails, and permits retry', async () => {
    const user = userEvent.setup()
    saveBig3ExerciseMapping.mockRejectedValueOnce(new Error('network error'))
    renderPage()
    const selector = await screen.findByRole('combobox', { name: 'デッドリフトの対象種目' })
    await user.selectOptions(selector, 'narrow')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(selector).toHaveValue('')
    expect(selector).toBeEnabled()
    expect(screen.getByText('480')).toBeInTheDocument()
    expect(fetchStrengthSnapshot).toHaveBeenCalledOnce()
    fetchStrengthSnapshot.mockResolvedValue(mapped)
    await user.selectOptions(selector, 'narrow')
    await waitFor(() => expect(selector).toHaveValue('narrow'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables mapping controls while saving to prevent overlapping updates', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    saveBig3ExerciseMapping.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    renderPage()
    const selector = await screen.findByRole('combobox', { name: 'デッドリフトの対象種目' })
    await user.selectOptions(selector, 'narrow')
    for (const control of screen.getAllByRole('combobox')) expect(control).toBeDisabled()
    expect(screen.getByText('保存・再計算中…')).toBeInTheDocument()
    fetchStrengthSnapshot.mockResolvedValue(mapped)
    finish()
    await waitFor(() => expect(selector).toBeEnabled())
  })

  it('hides stale metrics if refresh fails after saving and recovers via retry', async () => {
    const user = userEvent.setup()
    renderPage()
    const selector = await screen.findByRole('combobox', { name: 'デッドリフトの対象種目' })
    fetchStrengthSnapshot.mockRejectedValueOnce(new Error('refresh failed'))
    await user.selectOptions(selector, 'narrow')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('480')).not.toBeInTheDocument()
    fetchStrengthSnapshot.mockResolvedValue(mapped)
    await user.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByRole('combobox', { name: 'デッドリフトの対象種目' })).toHaveValue('narrow')
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(saveBig3ExerciseMapping).toHaveBeenCalledOnce()
  })
})
