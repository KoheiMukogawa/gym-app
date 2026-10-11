import { lazy } from 'react'

type Module = typeof import('./PublicPages')

let loaded: Module | null = null

/** Starts (or reuses) the download of the public pages chunk. */
export function loadPublicPages(): Promise<Module> {
  return import('./PublicPages').then((module) => (loaded = module))
}

/** The component without Suspense when already loaded (a prerendered first visit), else lazy. */
const LazyContent = lazy(() => loadPublicPages().then((m) => ({ default: m.PublicPageContent })))
export function publicPageContent(): Module['PublicPageContent'] | typeof LazyContent {
  return loaded?.PublicPageContent ?? LazyContent
}
