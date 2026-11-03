import { describe, expect, it } from 'vitest'
import { beforeSend, routeOf } from './speedInsights'

describe('speed insights', () => {
  it('replaces record ids so measurements group by screen', () => {
    expect(routeOf('/history/0b6f3c52-8a9e-4c1d-9f3a-2b7d1e5c4a90')).toBe('/history/:id')
    expect(routeOf('/exercises/0b6f3c52-8a9e-4c1d-9f3a-2b7d1e5c4a90')).toBe('/exercises/:id')
    expect(routeOf('/log')).toBe('/log')
    expect(routeOf('/')).toBe('/')
  })

  it('sends no ids, query or hash', () => {
    const event = beforeSend({ type: 'vital', url: 'https://gym-app-ruddy-nine.vercel.app/history/0b6f3c52-8a9e-4c1d-9f3a-2b7d1e5c4a90?date=2026-11-03#x' })
    expect(event).toEqual({ type: 'vital', url: 'https://gym-app-ruddy-nine.vercel.app/history/:id', route: '/history/:id' })
  })
})
