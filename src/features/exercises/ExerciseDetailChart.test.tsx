import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ExerciseDetailPage } from './ExerciseDetailPage'
import { ToastProvider } from '../../components/ui/Toast'
import type { Exercise, SetWithDate } from '../../lib/types'

const { fetchExercise, fetchExerciseSets } = vi.hoisted(() => ({
  fetchExercise: vi.fn(),
  fetchExerciseSets: vi.fn(),
}))
vi.mock('./queries', () => ({ fetchExercise, fetchExerciseSets }))

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession }))

// Recharts renders into an SVG sized by layout, which jsdom doesn't have — no
// pixel/point assertion is possible in this environment (see task-12-report.md).
// What *is* testable without layout is which prop keys the page hands to
// Recharts. Recharts types `dataKey` loosely (string | number | function), so a
// typo like `dataKey="maxWeight"` instead of `"max_weight"` compiles fine and
// would silently render an empty chart with no test catching it. This stubs
// each Recharts component to just record its own props instead of rendering
// SVG, so the wiring can be pinned against ExerciseSummary's actual field names.
const { captured } = vi.hoisted(() => ({
  captured: {
    lineChartData: undefined as unknown,
    xAxisDataKey: undefined as unknown,
    lineDataKey: undefined as unknown,
  },
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  CartesianGrid: () => null,
  Tooltip: () => null,
  YAxis: () => null,
  LineChart: ({ data, children }: { data: unknown; children: ReactNode }) => {
    captured.lineChartData = data
    return children
  },
  XAxis: ({ dataKey }: { dataKey: unknown }) => {
    captured.xAxisDataKey = dataKey
    return null
  },
  Line: ({ dataKey }: { dataKey: unknown }) => {
    captured.lineDataKey = dataKey
    return null
  },
}))

const USER = 'user-1'
const EXERCISE_ID = 'bench'

const EXERCISE: Exercise = {
  id: EXERCISE_ID,
  name: 'ベンチプレス',
  name_normalized: 'ベンチプレス',
  muscle_group: 'chest',
  is_preset: true,
  created_by: null,
  created_at: '2026-08-01T00:00:00Z',
}

const SET: SetWithDate = {
  id: 's1',
  workout_id: 'w1',
  exercise_id: EXERCISE_ID,
  set_index: 1,
  weight_kg: 80,
  reps: 8,
  created_at: '2026-08-08T10:00:00Z',
  performed_at: '2026-08-08T10:00:00Z',
}

function renderExerciseDetailPage() {
  return render(
    <MemoryRouter initialEntries={[`/exercises/${EXERCISE_ID}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('ExerciseDetailPage chart wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captured.lineChartData = undefined
    captured.xAxisDataKey = undefined
    captured.lineDataKey = undefined
    useSession.mockReturnValue({
      userId: USER,
      profile: null,
      loading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    })
  })

  // Coverage: pins the chart's dataKeys and data shape to ExerciseSummary's
  // actual field names ('date' / 'max_weight'), so a rename or typo in either
  // the summary shape or the JSX fails loudly instead of silently rendering an
  // empty chart (which no jsdom pixel test could catch).
  it('wires XAxis/Line dataKeys and chart data to the summary points, not a typo', async () => {
    fetchExercise.mockResolvedValueOnce(EXERCISE)
    fetchExerciseSets.mockResolvedValueOnce([SET])
    renderExerciseDetailPage()

    await screen.findByRole('heading', { name: 'ベンチプレス' })

    expect(captured.xAxisDataKey).toBe('date')
    expect(captured.lineDataKey).toBe('max_weight')
    expect(captured.lineChartData).toEqual([{ date: '2026-08-08', max_weight: 80 }])
  })
})
