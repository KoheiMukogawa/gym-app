// First-touch attribution: which public page (or campaign) brought someone here. It is saved
// once per browser and sent with sign-up as user metadata, so "calculator → sign-up" can be
// counted from the database without a third-party tracker. No personal data is stored.
const KEY = 'glog:first-touch'

export type FirstTouch = { source: string; path: string; referrer: string | null; at: string }

function externalReferrerHost(referrer: string, ownHost: string): string | null {
  try {
    const host = new URL(referrer).hostname
    return host && host !== ownHost ? host : null
  } catch {
    return null
  }
}

/** Remembers the first public page visited. Later visits never overwrite it. */
export function rememberFirstTouch(source: string, location: Location = window.location, referrer = document.referrer): void {
  try {
    if (localStorage.getItem(KEY)) return
    const campaign = new URLSearchParams(location.search).get('utm_source')
    const touch: FirstTouch = {
      source: (campaign ?? source).slice(0, 64),
      path: location.pathname.slice(0, 128),
      referrer: externalReferrerHost(referrer, location.hostname),
      at: new Date().toISOString(),
    }
    localStorage.setItem(KEY, JSON.stringify(touch))
  } catch {
    // Private mode or blocked storage: attribution is optional.
  }
}

export function readFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<FirstTouch>
    return typeof value.source === 'string' && typeof value.path === 'string'
      ? { source: value.source, path: value.path, referrer: value.referrer ?? null, at: value.at ?? '' }
      : null
  } catch {
    return null
  }
}

/** Sign-up metadata keys. The profile trigger ignores keys it does not know. */
export function signupAttribution(): Record<string, string> {
  const touch = readFirstTouch()
  if (!touch) return {}
  return {
    signup_source: touch.source,
    signup_path: touch.path,
    ...(touch.referrer ? { signup_referrer: touch.referrer } : {}),
  }
}
