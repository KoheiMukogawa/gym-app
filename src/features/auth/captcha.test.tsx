import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCaptcha } from './captcha'

type Options = { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }
let widgets: Options[] = []
const turnstile = {
  render: vi.fn((_el: HTMLElement, options: Options) => { widgets.push(options); return `w${widgets.length}` }),
  reset: vi.fn(),
  remove: vi.fn(),
}

function Probe({ siteKey }: { siteKey?: string }) {
  const captcha = useCaptcha(siteKey)
  return <>
    {captcha.widget}
    <span data-testid="token">{captcha.token ?? 'none'}</span>
    <span data-testid="ready">{String(captcha.ready)}</span>
    <button type="button" onClick={captcha.reset}>reset</button>
  </>
}

beforeEach(() => {
  widgets = []
  vi.clearAllMocks()
  Object.assign(window, { turnstile })
})
afterEach(() => { delete (window as { turnstile?: unknown }).turnstile })

describe('useCaptcha', () => {
  it('stays out of the way when no site key is configured', () => {
    render(<Probe />)
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
    expect(screen.getByTestId('token')).toHaveTextContent('none')
    expect(turnstile.render).not.toHaveBeenCalled()
  })

  it('renders the widget and is ready once a token arrives', async () => {
    render(<Probe siteKey="site-key" />)
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1))
    expect(widgets[0].sitekey).toBe('site-key')
    expect(screen.getByTestId('ready')).toHaveTextContent('false')
    act(() => widgets[0].callback('tok-1'))
    expect(screen.getByTestId('token')).toHaveTextContent('tok-1')
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
  })

  it('asks again after a reset or an expired token', async () => {
    render(<Probe siteKey="site-key" />)
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled())
    act(() => widgets[0].callback('tok-1'))
    await userEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(turnstile.reset).toHaveBeenCalledWith('w1')
    expect(screen.getByTestId('token')).toHaveTextContent('none')
    act(() => widgets[0].callback('tok-2'))
    act(() => widgets[0]['expired-callback']())
    expect(screen.getByTestId('ready')).toHaveTextContent('false')
  })

  it('explains a widget failure and retries it', async () => {
    render(<Probe siteKey="site-key" />)
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled())
    act(() => widgets[0]['error-callback']())
    expect(screen.getByRole('alert')).toHaveTextContent('ボットではないことの確認を読み込めませんでした')
    await userEvent.click(screen.getByRole('button', { name: '確認をやり直す' }))
    expect(turnstile.reset).toHaveBeenCalledWith('w1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('removes the widget when the form goes away', async () => {
    const { unmount } = render(<Probe siteKey="site-key" />)
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled())
    unmount()
    expect(turnstile.remove).toHaveBeenCalledWith('w1')
  })
})
