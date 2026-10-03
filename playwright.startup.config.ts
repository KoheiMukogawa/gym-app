import { defineConfig } from '@playwright/test'
import mockConfig from './playwright.mock.config'

// Run against a build made with the mock Supabase env, not the dev server:
// development StrictMode intentionally repeats mount effects and API calls.
export default defineConfig({
  ...mockConfig,
  testMatch: ['startup.spec.ts'],
  use: { ...mockConfig.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
})
