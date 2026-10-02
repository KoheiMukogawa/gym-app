import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['simple-flow.spec.ts', 'community.spec.ts', 'onboarding.spec.ts', 'health-sync.spec.ts', 'ranking-participation.spec.ts'],
  timeout: 60_000,
  use: {
    browserName: 'chromium',
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'mock-test-key' },
  },
})
