import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthCalendar } from './MonthCalendar'

describe('MonthCalendar', () => {
  it('renders every day of the month', () => {
    render(<MonthCalendar year={2026} month={8} activeDates={[]} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
    expect(screen.queryByText('32')).not.toBeInTheDocument()
  })

  it('marks days that have a workout', () => {
    render(<MonthCalendar year={2026} month={8} activeDates={['2026-08-14']} />)
    expect(screen.getByLabelText('8月14日 トレーニングあり')).toBeInTheDocument()
  })

  it('does not mark days without a workout', () => {
    render(<MonthCalendar year={2026} month={8} activeDates={['2026-08-14']} />)
    expect(screen.queryByLabelText('8月13日 トレーニングあり')).not.toBeInTheDocument()
  })
})
