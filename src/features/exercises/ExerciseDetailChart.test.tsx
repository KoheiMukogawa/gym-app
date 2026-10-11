import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ExerciseDetailPage } from './ExerciseDetailPage'
import { ToastProvider } from '../../components/ui/Toast'
import type { Exercise, SetWithDate } from '../../lib/types'
import { localDate } from '../../lib/dates'

const { fetchExercise, fetchExerciseSets } = vi.hoisted(() => ({
  fetchExercise: vi.fn(),
  fetchExerciseSets: vi.fn(),
}))
vi.mock('../profile/bodyweightQueries', () => ({ fetchBodyweightLogs: async () => [] }))
vi.mock('./queries', () => ({ fetchExercise, fetchExerciseSets }))
vi.mock('./ExerciseDayDetails', () => ({
  ExerciseDayDetails: ({ date }: { date: string }) => <div>選択日: {date}</div>,
}))

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
    lineDot: undefined as unknown,
  },
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  CartesianGrid: () => null,
  Tooltip: () => null,
  YAxis: () => null,
  ReferenceLine: () => null,
  LineChart: ({ data, children, onClick }: { data: unknown; children: ReactNode; onClick: (state: { activeLabel: string }) => void }) => {
    captured.lineChartData = data
    return <div>{children}<button onClick={() => onClick({ activeLabel: '2026-08-08' })}>記録点</button></div>
  },
  XAxis: ({ dataKey }: { dataKey: unknown }) => {
    captured.xAxisDataKey = dataKey
    return null
  },
  Line: ({ dataKey, dot }: { dataKey: unknown; dot: unknown }) => {
    captured.lineDataKey = dataKey
    captured.lineDot = dot
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
    captured.lineDot = undefined
    useSession.mockReturnValue({
      userId: USER,
      profile: null,
      loading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    })
  })

  // Coverage: pins the chart's dataKeys and data shape to ExerciseSummary's
  // actual field names ('date' / 'e1rm'), so a rename or typo in either
  // the summary shape or the JSX fails loudly instead of silently rendering an
  // empty chart (which no jsdom pixel test could catch).
  it('wires XAxis/Line dataKeys and chart data to the summary points, not a typo', async () => {
    fetchExercise.mockResolvedValueOnce(EXERCISE)
    fetchExerciseSets.mockResolvedValueOnce([SET])
    renderExerciseDetailPage()

    await screen.findByRole('heading', { name: 'ベンチプレス' })

    expect(captured.xAxisDataKey).toBe('date')
    expect(captured.lineDataKey).toBe('e1rm')
    // 80kg × 8回 → Brzycki 80 × 36 / 29 = 99.3
    expect(captured.lineChartData).toEqual([{ date: '2026-08-08', e1rm: 99.3 }])
    // Days are picked by tapping the chart only; there is no separate date list.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('グラフをタップすると、その日の記録を表示します。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '記録点' }))
    expect(screen.getByText('選択日: 2026-08-08')).toBeInTheDocument()
  })

  it('opens on the last six months and shows the whole history with the button', async () => {
    const day = (date: string, weight: number): SetWithDate => ({ ...SET, id: date, weight_kg: weight, created_at: `${date}T10:00:00Z`, performed_at: `${date}T10:00:00Z` })
    const recent = localDate(new Date(Date.now() - 7 * 86400000))
    const older = localDate(new Date(Date.now() - 30 * 86400000))
    fetchExercise.mockResolvedValueOnce(EXERCISE)
    fetchExerciseSets.mockResolvedValueOnce([day('2020-01-01', 60), day(older, 70), day(recent, 80)])
    renderExerciseDetailPage()

    await screen.findByRole('heading', { name: 'ベンチプレス' })
    expect((captured.lineChartData as { date: string }[]).map((p) => p.date)).toEqual([older, recent])
    expect(screen.getByText(/2本指で拡大・縮小/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '全期間' }))
    expect((captured.lineChartData as { date: string }[]).map((p) => p.date)).toEqual(['2020-01-01', older, recent])
    expect(screen.queryByRole('button', { name: '全期間' })).not.toBeInTheDocument()
  })

  it('draws a line without daily dots for long histories', async () => {
    const days = Array.from({ length: 40 }, (_, i) => localDate(new Date(Date.now() - i * 2 * 86400000)))
    fetchExercise.mockResolvedValueOnce(EXERCISE)
    fetchExerciseSets.mockResolvedValueOnce(days.reverse().map((date) => ({ ...SET, id: date, created_at: `${date}T10:00:00Z`, performed_at: `${date}T10:00:00Z` })))
    renderExerciseDetailPage()

    await screen.findByRole('heading', { name: 'ベンチプレス' })
    expect(captured.lineDot).toBe(false)
  })

  it('keeps daily dots and leaves out zooming for short histories', async () => {
    fetchExercise.mockResolvedValueOnce(EXERCISE)
    fetchExerciseSets.mockResolvedValueOnce([SET])
    renderExerciseDetailPage()

    await screen.findByRole('heading', { name: 'ベンチプレス' })
    expect(captured.lineDot).not.toBe(false)
    expect(screen.queryByText(/2本指/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '全期間' })).not.toBeInTheDocument()
  })
})
