import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ExerciseDayDetails } from './ExerciseDayDetails'

const { fetchWorkoutsInRange } = vi.hoisted(() => ({ fetchWorkoutsInRange: vi.fn() }))
vi.mock('../history/queries', () => ({ fetchWorkoutsInRange }))
vi.mock('../profile/bodyweightQueries', () => ({ fetchBodyweightLogs: async () => [] }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1' }) }))

describe('selected exercise day', () => {
  it('shows every matching set and note, excludes other exercises, and links to editing', async () => {
    fetchWorkoutsInRange.mockResolvedValueOnce([{
      workout_id: 'w1', user_id: 'u1', display_name: '本人', performed_at: '2026-08-08T10:00:00Z',
      sets: [
        { exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 8, note: 'フォーム確認' },
        { exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 70, reps: 10 },
        { exercise_id: 'squat', exercise_name: 'スクワット', weight_kg: 100, reps: 5 },
      ],
    }])
    render(<MemoryRouter><ExerciseDayDetails exerciseId="bench" date="2026-08-08" /></MemoryRouter>)
    await screen.findByText('フォーム確認')
    expect(screen.getByText('80.0 kg')).toBeInTheDocument()
    expect(screen.getByText('70.0 kg')).toBeInTheDocument()
    expect(screen.queryByText('スクワット')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'この日の記録を編集' })).toHaveAttribute('href', '/history/w1')
    const [, start, end] = fetchWorkoutsInRange.mock.calls[0]
    expect(new Date(start).getDate()).toBe(8)
    expect(new Date(end).getDate()).toBe(9)
  })
})
