import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkoutCard } from './WorkoutCard'
import type { FeedItem } from './queries'

const ITEM: FeedItem = {
  workout_id: 'w1',
  user_id: 'u1',
  display_name: 'たろう',
  performed_at: '2026-08-14T10:00:00Z',
  sets: [
    { exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 8 },
    { exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 6 },
    { exercise_id: 'squat', exercise_name: 'スクワット', weight_kg: 100, reps: 5 },
  ],
}

function renderCard(item: FeedItem) {
  return render(
    <MemoryRouter>
      <WorkoutCard item={item} />
    </MemoryRouter>,
  )
}

describe('WorkoutCard', () => {
  it('shows who trained', () => {
    renderCard(ITEM)
    expect(screen.getByText('たろう')).toBeInTheDocument()
  })

  it('groups sets by exercise and shows the set count', () => {
    renderCard(ITEM)
    expect(screen.getByText('ベンチプレス')).toBeInTheDocument()
    expect(screen.getByText('3セット')).toBeInTheDocument()
  })

  it('shows the total volume', () => {
    renderCard(ITEM)
    // 80*8 + 80*6 + 100*5 = 1620
    expect(screen.getByText('1,620 kg')).toBeInTheDocument()
  })

  // jsdom does not run real layout, so a pixel-height assertion would always
  // read 0 regardless of the actual class. We instead assert on the `min-h-14`
  // utility class, which is the codebase's established 56px tap-target token
  // (see AppShell.tsx, ExercisePicker.tsx) — an honest proxy for "meets the
  // convention", not a tautology against arbitrary implementation detail.
  it('gives the exercise link a tap target meeting the 56px convention', () => {
    renderCard(ITEM)
    const link = screen.getByRole('link', { name: 'ベンチプレス' })
    expect(link).toHaveClass('min-h-14')
  })
})
