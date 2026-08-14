import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberStepper } from './NumberStepper'

describe('NumberStepper', () => {
  it('shows the label, value, and unit', () => {
    render(
      <NumberStepper label="重量" value={80} unit="kg" onStep={vi.fn()} onEnter={vi.fn()} />,
    )
    expect(screen.getByText('重量')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重量を直接入力' })).toHaveTextContent('80')
    expect(screen.getByText('kg')).toBeInTheDocument()
  })

  it('calls onStep with 1 when increment is pressed', async () => {
    const onStep = vi.fn()
    render(
      <NumberStepper label="重量" value={80} unit="kg" onStep={onStep} onEnter={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: '重量を増やす' }))
    expect(onStep).toHaveBeenCalledWith(1)
  })

  it('calls onStep with -1 when decrement is pressed', async () => {
    const onStep = vi.fn()
    render(
      <NumberStepper label="重量" value={80} unit="kg" onStep={onStep} onEnter={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: '重量を減らす' }))
    expect(onStep).toHaveBeenCalledWith(-1)
  })

  it('switches to a numeric input when the value is tapped, and commits on blur', async () => {
    const onEnter = vi.fn()
    render(
      <NumberStepper label="重量" value={80} unit="kg" onStep={vi.fn()} onEnter={onEnter} />,
    )
    await userEvent.click(screen.getByRole('button', { name: '重量を直接入力' }))

    const input = screen.getByRole('spinbutton', { name: '重量' })
    await userEvent.clear(input)
    await userEvent.type(input, '62.5')
    await userEvent.tab()

    expect(onEnter).toHaveBeenCalledWith(62.5)
  })

  it('ignores a non-numeric entry', async () => {
    const onEnter = vi.fn()
    render(
      <NumberStepper label="回数" value={8} unit="回" onStep={vi.fn()} onEnter={onEnter} />,
    )
    await userEvent.click(screen.getByRole('button', { name: '回数を直接入力' }))

    const input = screen.getByRole('spinbutton', { name: '回数' })
    await userEvent.clear(input)
    await userEvent.tab()

    expect(onEnter).not.toHaveBeenCalled()
  })

  it('commits again after a second edit session', async () => {
    const onEnter = vi.fn()
    render(
      <NumberStepper label="重量" value={80} unit="kg" onStep={vi.fn()} onEnter={onEnter} />,
    )

    await userEvent.click(screen.getByRole('button', { name: '重量を直接入力' }))
    const firstInput = screen.getByRole('spinbutton', { name: '重量' })
    await userEvent.clear(firstInput)
    await userEvent.type(firstInput, '85')
    await userEvent.tab()
    expect(onEnter).toHaveBeenNthCalledWith(1, 85)

    await userEvent.click(screen.getByRole('button', { name: '重量を直接入力' }))
    const secondInput = screen.getByRole('spinbutton', { name: '重量' })
    await userEvent.clear(secondInput)
    await userEvent.type(secondInput, '90')
    await userEvent.tab()
    expect(onEnter).toHaveBeenNthCalledWith(2, 90)
  })
})
