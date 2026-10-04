import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// Cloudflare Turnstile guards sign-in, sign-up and password reset once Supabase requires CAPTCHA.
// Without a site key (local development, tests) the forms work as before and send no token.
type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global { interface Window { turnstile?: Turnstile } }

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<Turnstile> | null = null

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'))
    script.onerror = () => { loading = null; script.remove(); reject(new Error('turnstile failed to load')) }
    document.head.appendChild(script)
  })
  return loading
}

export type Captcha = {
  /** The widget to place in the form; null when CAPTCHA is off. */
  widget: ReactNode
  /** The one-time token to send with the request. */
  token: string | undefined
  /** True when the form may be submitted. */
  ready: boolean
  /** Call after every request: a token can be used only once. */
  reset: () => void
}

export function useCaptcha(siteKey: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY): Captcha {
  const box = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [token, setToken] = useState<string | undefined>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!siteKey) return
    let active = true
    loadTurnstile().then((turnstile) => {
      if (!active || !box.current || widgetId.current) return
      widgetId.current = turnstile.render(box.current, {
        sitekey: siteKey,
        language: 'ja',
        theme: 'dark',
        callback: (value: string) => { setToken(value); setFailed(false) },
        'expired-callback': () => setToken(undefined),
        'error-callback': () => { setToken(undefined); setFailed(true) },
      })
    }).catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      if (widgetId.current) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey, attempt])

  const reset = useCallback(() => {
    setToken(undefined)
    if (widgetId.current) window.turnstile?.reset(widgetId.current)
  }, [])

  const retry = useCallback(() => {
    setFailed(false)
    // A widget that rendered can be reset; one whose script never loaded is rendered again.
    if (widgetId.current) reset()
    else setAttempt((n) => n + 1)
  }, [reset])

  if (!siteKey) return { widget: null, token: undefined, ready: true, reset: () => {} }
  return {
    widget: <div>
      <div ref={box} className="min-h-[65px]" />
      {failed && <div className="space-y-2">
        <p role="alert" className="text-sm text-accent">ボットではないことの確認を読み込めませんでした。通信状況を確認してください。</p>
        <button type="button" onClick={retry} className="flex min-h-14 items-center text-sm text-accent">確認をやり直す</button>
      </div>}
    </div>,
    token,
    ready: Boolean(token),
    reset,
  }
}
