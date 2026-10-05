const KEY = 'glog.stale-build-reload'
const RETRY_AFTER_MS = 30_000

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
  sessionStorage: Storage
  location: { reload: () => void }
}

/**
 * After a deploy, the new service worker removes the previous build's files, so a page that was
 * already open fails to load the next screen it opens. Reload once to switch to the new build.
 * A second failure soon after is a real outage: leave it to ScreenErrorBoundary instead of looping.
 */
export function installStaleBuildRecovery(target: Target = window, now: () => number = Date.now): () => void {
  const recover = () => {
    try {
      if (now() - Number(target.sessionStorage.getItem(KEY) ?? 0) < RETRY_AFTER_MS) return
      target.sessionStorage.setItem(KEY, String(now()))
    } catch {
      // Without storage a reload could repeat forever; the error screen offers a manual reload.
      return
    }
    target.location.reload()
  }
  target.addEventListener('vite:preloadError', recover)
  return () => target.removeEventListener('vite:preloadError', recover)
}
