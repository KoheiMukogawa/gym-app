import { describe, it, expect } from 'vitest'
import { appName } from './smoke'

describe('appName', () => {
  it('returns the application name', () => {
    expect(appName()).toBe('ジム記録')
  })
})
