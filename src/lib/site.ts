// The one place that knows the public origin. Canonical URLs, the sitemap and Open Graph tags
// all derive from it, so moving to a custom domain means setting VITE_SITE_URL and rebuilding.
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://gym-app-ruddy-nine.vercel.app').replace(/\/+$/, '')

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
