import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useLaunchSheet, type LaunchSheet, type LaunchSheetStatus } from './launchSheets'

function Sheet({ kind, status }: { kind: LaunchSheet; status: LaunchSheetStatus }) {
  const showing = useLaunchSheet(kind, status)
  return showing ? <p>{kind}</p> : null
}

function Sheets(statuses: Partial<Record<LaunchSheet, LaunchSheetStatus>>) {
  return <>{(['announcements', 'install', 'feedback-reply', 'poll'] as const).map((kind) =>
    <Sheet key={kind} kind={kind} status={statuses[kind] ?? 'none'} />)}</>
}

const flush = () => act(async () => {})
const shown = () => screen.queryAllByText(/^(announcements|install|feedback-reply|poll)$/).map((el) => el.textContent)

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('launch sheets', () => {
  it('shows only the highest-priority sheet that wants to open, and nothing else in the same launch', async () => {
    const { rerender } = render(<Sheets announcements="wants" install="wants" poll="wants" />)
    await flush()
    expect(shown()).toEqual(['install'])
    // 閉じても、同じ起動では次のシートを出さない
    rerender(<Sheets announcements="wants" install="none" poll="wants" />)
    await flush()
    expect(shown()).toEqual([])
  })

  it('waits while a higher-priority sheet is still checking', async () => {
    const { rerender } = render(<Sheets feedback-reply="checking" announcements="wants" />)
    await flush()
    expect(shown()).toEqual([])
    rerender(<Sheets feedback-reply="wants" announcements="wants" />)
    await flush()
    expect(shown()).toEqual(['feedback-reply'])
  })

  it('stops waiting for a sheet whose check takes too long', async () => {
    vi.useFakeTimers()
    render(<Sheets poll="checking" announcements="wants" />)
    await flush()
    expect(shown()).toEqual([])
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(shown()).toEqual(['announcements'])
  })

  it('treats coming back after 30 minutes in the background as a new launch', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Sheets poll="wants" announcements="wants" />)
    await flush()
    rerender(<Sheets poll="none" announcements="wants" />)
    await flush()
    expect(shown()).toEqual([])
    // 少し裏に回っただけでは出さない
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    setVisibility('visible')
    await flush()
    expect(shown()).toEqual([])
    setVisibility('hidden')
    vi.advanceTimersByTime(30 * 60_000)
    setVisibility('visible')
    await flush()
    expect(shown()).toEqual(['announcements'])
  })

  it('starts over after every sheet is gone, as after signing out', async () => {
    const first = render(<Sheets announcements="wants" />)
    await flush()
    expect(shown()).toEqual(['announcements'])
    first.unmount()
    render(<Sheets poll="wants" />)
    await flush()
    expect(shown()).toEqual(['poll'])
  })
})
