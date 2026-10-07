import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary'
import './index.css'
import { installStaleBuildRecovery } from './lib/staleBuild'
import { prerenderedPath } from './lib/prerendered'
import { loadPublicPages } from './features/tools/loadPublicPages'

installStaleBuildRecovery()

function start() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ScreenErrorBoundary><App /></ScreenErrorBoundary>
    </StrictMode>,
  )
}

// A prerendered public page stays on screen (and usable) until its code is ready.
if (prerenderedPath()) loadPublicPages().then(start, start)
else start()
