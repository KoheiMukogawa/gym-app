import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Under the parallel `npm test` run, heavy screens (recording dials, rankings, the history
// editor) can take longer than Testing Library's default 1s to settle, so findBy/waitFor timed
// out at random. Give them the same headroom as the per-test timeout in vite.config.ts allows.
configure({ asyncUtilTimeout: 5_000 })
