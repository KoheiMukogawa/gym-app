import { describe, expect, it, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { LIST_MODE_RELEASED_AT, loadInputMode, shouldAskInputMode, useLogInputMode } from './inputMode'

describe('input mode', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to the dial and remembers the choice per user', () => {
    const { result } = renderHook(() => useLogInputMode('u1'))
    expect(result.current).toMatchObject({ mode: 'dial', chosen: false })
    act(() => result.current.setMode('list'))
    expect(result.current).toMatchObject({ mode: 'list', chosen: true })
    expect(loadInputMode('u1')).toBe('list')
    expect(loadInputMode('u2')).toBeNull()
  })

  it('tells other screens when the mode changes', () => {
    const a = renderHook(() => useLogInputMode('u1'))
    const b = renderHook(() => useLogInputMode('u1'))
    act(() => a.result.current.setMode('list'))
    expect(b.result.current.mode).toBe('list')
  })

  it('asks only people who signed up after the release and have not chosen', () => {
    const after = new Date(Date.parse(LIST_MODE_RELEASED_AT) + 1000).toISOString()
    expect(shouldAskInputMode(after, false)).toBe(true)
    expect(shouldAskInputMode(after, true)).toBe(false)
    expect(shouldAskInputMode('2026-10-01T00:00:00Z', false)).toBe(false)
    expect(shouldAskInputMode(null, false)).toBe(false)
  })
})
