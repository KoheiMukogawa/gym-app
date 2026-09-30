import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  { id: 'conventional', name: 'コンベンショナルデッドリフト', name_normalized: 'コンベンショナルデッドリフト', is_preset: false },
]
const rows = [
  { exercise_id: 'squat', weight_kg: 180, reps: 1 },
  { exercise_id: 'bench', weight_kg: 100, reps: 1 },
  { exercise_id: 'deadlift', weight_kg: 200, reps: 1 },
  { exercise_id: 'conventional', weight_kg: 220, reps: 1 },
].map((row) => ({ ...row, performed_at: '2026-01-01T12:00:00Z' }))
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
  it('shows metrics without exercise mapping controls or a catalog request', async () => {
    renderPage()
    expect(await screen.findByText('480')).toBeInTheDocument()
    expect(screen.queryByText('Big3の対象種目')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(fetchExercises).not.toHaveBeenCalled()
  })
  it('preserves existing mapped calculations', async () => {
    fetchStrengthSnapshot.mockResolvedValue(mapped)
    renderPage()
    expect(await screen.findByText('500')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /デッドリフト コンベンショナルデッドリフト/ })).toHaveAttribute('href', '/exercises/conventional')
    expect(saveBig3ExerciseMapping).not.toHaveBeenCalled()
  })
  it('recovers from a load failure using retry', async () => {
    fetchStrengthSnapshot.mockRejectedValueOnce(new Error('network'))
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: '再試行' }))
    expect(await screen.findByText('480')).toBeInTheDocument()
  })
})
