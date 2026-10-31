import { IS_DEMO } from '../../lib/demoMode'
// Where the app is running, to explain "add to home screen" in the right words.
// iPhone has no install API: people add the page from the share menu, and pages
// opened inside LINE or Instagram cannot be added until they are opened in a browser.
export type InstallEnv =
  | 'installed' // opened from the home screen icon
  | 'ios-safari'
  | 'ios-other' // Chrome, Edge or Firefox on iPhone: same share menu, button in another place
  | 'line'
  | 'in-app' // Instagram, Facebook and other in-app browsers
  | 'android'
  | 'desktop' // PCs use the browser; no guide

export function detectInstallEnv(userAgent: string, standalone: boolean, maxTouchPoints = 0): InstallEnv {
  if (standalone) return 'installed'
  if (/\bLine\//i.test(userAgent)) return 'line'
  if (/Instagram|FBAN|FBAV|FB_IAB|Twitter|TikTok|musical_ly|Bytedance/i.test(userAgent)) return 'in-app'
  // iPadOS reports itself as a Mac; touch tells them apart.
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent) ? 'ios-other' : 'ios-safari'
  if (/Android/i.test(userAgent)) return 'android'
  return 'desktop'
}

export function currentInstallEnv(): InstallEnv {
  // 紹介ページの見本では「ホーム画面に追加」を出さない
  if (typeof window === 'undefined' || IS_DEMO) return 'desktop'
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return detectInstallEnv(navigator.userAgent, standalone, navigator.maxTouchPoints)
}

/** Whether to offer the guide at all. */
export const canGuideInstall = (env: InstallEnv) => env !== 'installed' && env !== 'desktop'

// Android Chrome offers its own install dialog. Keep the event from the moment
// the page loads, so a button can open it later.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: InstallPromptEvent | null = null

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => { deferred = null })
}

export const hasInstallPrompt = () => deferred !== null

/** Opens the browser's install dialog. True when the person added the app. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null // each event can be shown once
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}
