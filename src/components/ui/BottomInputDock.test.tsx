import { act, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomInputDock } from './BottomInputDock'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setup() {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
  vi.stubGlobal('innerHeight', 844)
  vi.stubGlobal('visualViewport', viewport)
  render(<BottomInputDock><input aria-label="重量" /><textarea aria-label="メモ" /></BottomInputDock>)
  const panel = screen.getByRole('region', { name: 'セット入力' }).firstElementChild as HTMLElement
  const change = (height: number, offsetTop = 0, scale = 1) => act(() => {
    Object.assign(viewport, { height, offsetTop, scale })
    viewport.dispatchEvent(new Event('resize'))
    viewport.dispatchEvent(new Event('scroll'))
  })
  return { panel, change }
}

describe('BottomInputDock', () => {
  it('retains navigation clearance during toolbar changes, even with a focused input', () => {
    const { panel, change } = setup()
    change(800)
    expect(panel.style.bottom).toBe('calc(4.5rem + env(safe-area-inset-bottom))')
    act(() => screen.getByRole('textbox', { name: '重量' }).focus())
    change(790)
    expect(panel.style.bottom).toBe('calc(4.5rem + env(safe-area-inset-bottom))')
    expect(panel.style.maxHeight).toBe('65dvh')
  })

  it('places controls above the keyboard and restores navigation clearance when it closes', () => {
    const { panel, change } = setup()
    act(() => screen.getByRole('textbox', { name: '重量' }).focus())
    change(360, 48)
    expect(panel.style.bottom).toBe('436px')
    expect(panel.style.maxHeight).toBe('344px')
    // iOS can keep the input focused after the keyboard is dismissed.
    change(800)
    expect(panel.style.bottom).toBe('calc(4.5rem + env(safe-area-inset-bottom))')
  })

  it('supports a memo keyboard and does not drop the dock during blur animation', async () => {
    const { panel, change } = setup()
    const memo = screen.getByRole('textbox', { name: 'メモ' })
    act(() => memo.focus())
    change(400)
    expect(panel.style.bottom).toBe('444px')
    await act(async () => memo.blur())
    expect(panel.style.bottom).toBe('444px')
    change(844)
    expect(panel.style.bottom).toBe('calc(4.5rem + env(safe-area-inset-bottom))')
  })

  it('does not interpret an unfocused viewport shrink or pinch zoom as a keyboard', () => {
    const { panel, change } = setup()
    change(400)
    expect(panel.style.bottom).toBe('calc(4.5rem + env(safe-area-inset-bottom))')
    act(() => screen.getByRole('textbox', { name: '重量' }).focus())
    change(400, 0, 2)
    expect(panel.style.bottom).toBe('calc(4.5rem + env(safe-area-inset-bottom))')
  })
})
