import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WheelNumber } from './WheelNumber'
import { formatAddedLoad } from '../../lib/bodyweight'

function Controlled({ initial = 80, label = '重量', unit = 'kg', min = 0, format }: {
  initial?: number; label?: string; unit?: string; min?: number; format?: (number: number) => string
}) {
  const [value, setValue] = useState(initial)
  return <WheelNumber label={label} value={value} unit={unit} min={min} format={format} onEnter={setValue} />
}

describe('WheelNumber', () => {
  it('uses the dial alone and supports keyboard adjustment', () => {
    render(<Controlled />)
    expect(screen.queryByRole('spinbutton', { name: '重量' })).toHaveAttribute('aria-valuenow', '80')
    expect(document.querySelector('input')).toBeNull()
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowUp' })
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '82.5')
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowDown' })
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '80')
  })

  it('edits the center value and preserves exact decimal loads after closing entry', () => {
    render(<Controlled />)
    fireEvent.click(screen.getByRole('button', { name: '重量を直接入力' }))
    const input = screen.getByRole('spinbutton', { name: '重量' })
    fireEvent.change(input, { target: { value: '82.3' } })
    fireEvent.blur(input)
    expect(document.querySelector('input')).toBeNull()
    expect(screen.getByRole('button', { name: '重量を直接入力' })).toHaveTextContent('82.3')
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '82.3')
  })

  it('keeps a historical value outside the regular dial range selectable', () => {
    render(<Controlled initial={120} label="回数" unit="回" min={1} />)
    expect(screen.getByRole('button', { name: '回数を直接入力' })).toHaveTextContent('120')
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowDown' })
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '100')
  })

  it('reaches zero reps when the minimum allows a failed set', () => {
    render(<Controlled initial={1} label="回数" unit="回" min={0} />)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuemin', '0')
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'ArrowDown' })
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '0')
  })

  it('formats assisted loads and retains negative direct entry', () => {
    render(<Controlled initial={0} label="加重" min={-70} format={formatAddedLoad} />)
    expect(screen.getByRole('button', { name: '加重を直接入力' })).toHaveTextContent('自重')
    fireEvent.click(screen.getByRole('button', { name: '加重を直接入力' }))
    const input = screen.getByRole('spinbutton', { name: '加重' })
    fireEvent.change(input, { target: { value: '-20' } })
    fireEvent.blur(input)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuetext', '−20 kg')
  })

  it('only changes the value on a user-initiated scroll', () => {
    const onEnter = vi.fn()
    render(<WheelNumber label="重量" unit="kg" value={80} onEnter={onEnter} />)
    const wheel = screen.getByLabelText('重量をスクロールで選択')
    fireEvent.scroll(wheel, { target: { scrollTop: 34 * 56 } })
    expect(onEnter).not.toHaveBeenCalled()
    fireEvent.pointerDown(wheel)
    fireEvent.scroll(wheel, { target: { scrollTop: 34 * 56 } })
    expect(onEnter).toHaveBeenLastCalledWith(85)
  })

  it('keeps the selected row aligned when scrolling away from a custom load', () => {
    render(<Controlled initial={82.3} />)
    const wheel = screen.getByLabelText('重量をスクロールで選択')
    fireEvent.pointerDown(wheel)
    fireEvent.scroll(wheel, { target: { scrollTop: 35 * 56 } })
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '85')
    expect(screen.getByRole('button', { name: '重量を直接入力' })).toHaveTextContent('85')
  })

  it('does not let an old scroll timer move the dial after direct entry', () => {
    vi.useFakeTimers()
    try {
      render(<Controlled initial={82.3} />)
      const wheel = screen.getByLabelText('重量をスクロールで選択')
      fireEvent.pointerDown(wheel)
      fireEvent.scroll(wheel, { target: { scrollTop: 35 * 56 } })
      fireEvent.click(screen.getByRole('button', { name: '重量を直接入力' }))
      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '82.3' } })
      fireEvent.blur(input)
      act(() => vi.advanceTimersByTime(250))
      expect(wheel.scrollTop).toBe(33 * 56)
      expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '82.3')
    } finally { vi.useRealTimers() }
  })

  it('settles on the latest controlled value if a suggestion changes during scrolling', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<WheelNumber label="回数" value={8} unit="回" onEnter={vi.fn()} />)
      const wheel = screen.getByLabelText('回数をスクロールで選択')
      fireEvent.pointerDown(wheel)
      fireEvent.scroll(wheel, { target: { scrollTop: 10 * 56 } })
      rerender(<WheelNumber label="回数" value={6} unit="回" onEnter={vi.fn()} />)
      act(() => vi.advanceTimersByTime(250))
      expect(wheel.scrollTop).toBe(5 * 56)
      expect(screen.getByRole('button', { name: '回数を直接入力' })).toHaveTextContent('6')
    } finally { vi.useRealTimers() }
  })
})
