// When to show the "add to home screen" guide. Kept on the device, per person:
// once right after sign-up, once more after the first finished workout for those
// who skipped it, and a home card until it is closed. The menu opens it any time.
const OPEN_EVENT = 'glog-install-guide-open'
const signupKey = (userId: string) => `glog:install-after-signup:${userId}`
const workoutKey = (userId: string) => `glog:install-after-workout:${userId}`
const cardKey = (userId: string) => `glog:install-card-dismissed:${userId}`

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* only affects this device's reminder */ }
}

export function markSignedUp(userId: string) {
  write(signupKey(userId), 'pending')
}

/** Called when a workout with sets ends. Asks once, and only after the sign-up guide was skipped or missed. */
export function markWorkoutFinished(userId: string) {
  if (read(workoutKey(userId)) === null) write(workoutKey(userId), 'pending')
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export type GuideReason = 'signup' | 'workout'

export function pendingGuide(userId: string): GuideReason | null {
  if (read(signupKey(userId)) === 'pending') return 'signup'
  if (read(workoutKey(userId)) === 'pending') return 'workout'
  return null
}

/** Closing the guide ends that reminder. The after-workout one is asked only once. */
export function guideSeen(userId: string, reason: GuideReason) {
  write(signupKey(userId), null)
  if (reason === 'workout') write(workoutKey(userId), 'done')
}

export function openInstallGuide() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: 'manual' }))
}

export function onInstallGuideRequest(listener: (manual: boolean) => void) {
  const handle = (event: Event) => listener(event instanceof CustomEvent && event.detail === 'manual')
  window.addEventListener(OPEN_EVENT, handle)
  return () => window.removeEventListener(OPEN_EVENT, handle)
}

export const cardDismissed = (userId: string) => read(cardKey(userId)) === '1'
export const dismissCard = (userId: string) => write(cardKey(userId), '1')
