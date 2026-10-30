import { beforeEach, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrengthScore } from './StrengthScore'
import { buildStrengthSnapshot } from './strengthSnapshot'
import { estimateOneRepMax } from '../../lib/strength'

const exercises = ['スクワット', 'ベンチプレス', 'デッドリフト'].map((name, i) => ({ id: ['squat', 'bench', 'deadlift'][i], name, name_normalized: name, is_preset: true }))
const day = '2026-10-01T12:00:00Z'
const rows = [
  { exercise_id: 'squat', weight_kg: 150, reps: 5, performed_at: day },
  { exercise_id: 'squat', weight_kg: 160, reps: 1, performed_at: day },
  { exercise_id: 'bench', weight_kg: 100, reps: 3, performed_at: day },
  { exercise_id: 'bench', weight_kg: 95, reps: 1, performed_at: day },
  { exercise_id: 'deadlift', weight_kg: 200, reps: 1, performed_at: day },
]
const score = () => screen.getByRole('region', { name: 'Big3スコア' })

beforeEach(() => localStorage.clear())

it('switches the total between estimated 1RMs and weights actually lifted once, and remembers it', async () => {
  const snapshot = buildStrengthSnapshot(exercises, [], rows)
  const estimated = Math.round((Math.max(estimateOneRepMax(150, 5)!, 160) + Math.max(estimateOneRepMax(100, 3)!, 95) + 200) * 10) / 10
  const { unmount } = render(<StrengthScore snapshot={snapshot} goal={null} />)
  expect(within(score()).getByRole('heading')).toHaveTextContent(/^TOTAL$/)
  expect(score()).not.toHaveTextContent('BIG 3 TOTAL')
  expect(score()).toHaveTextContent(String(estimated))
  expect(within(score()).getByRole('radio', { name: 'e1RM' })).toHaveAttribute('aria-checked', 'true')

  await userEvent.click(within(score()).getByRole('radio', { name: '1RM' }))
  // 160 + 95 + 200: only sets of one rep count.
  expect(score()).toHaveTextContent('455')
  expect(score()).toHaveTextContent('各種目で1回で挙げた最高重量を合算')
  unmount()

  render(<StrengthScore snapshot={snapshot} goal={null} />)
  expect(within(score()).getByRole('radio', { name: '1RM' })).toHaveAttribute('aria-checked', 'true')
})

it('waits for a single in every lift before showing the actual total', async () => {
  render(<StrengthScore snapshot={buildStrengthSnapshot(exercises, [], rows.filter((row) => row.exercise_id !== 'bench' || row.reps !== 1))} goal={null} />)
  await userEvent.click(within(score()).getByRole('radio', { name: '1RM' }))
  expect(score()).toHaveTextContent('3種目とも1回で挙げた記録がそろうと合計を表示します')
})
