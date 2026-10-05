import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary'
import './index.css'
import { installStaleBuildRecovery } from './lib/staleBuild'

installStaleBuildRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ScreenErrorBoundary><App /></ScreenErrorBoundary>
  </StrictMode>,
)
