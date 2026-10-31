// 紹介ページの見本（/demo）では、ほかのモジュールより先に時計を止める
import './lib/demoMode'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary'
import './index.css'
import { installStaleBuildRecovery } from './lib/staleBuild'
import { captureInstallPrompt } from './features/install/installEnv'
import { prerenderedPath } from './lib/prerendered'
import { loadPublicPages } from './features/tools/loadPublicPages'

installStaleBuildRecovery()
captureInstallPrompt()

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
