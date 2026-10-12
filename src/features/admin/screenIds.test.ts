import { describe, expect, it } from 'vitest'
import { screenIdFor } from './screenIds'

describe('screenIdFor', () => {
  it('names fixed screens', () => {
    expect(screenIdFor('/', false)).toBe('HOME-01')
    expect(screenIdFor('/history', false)).toBe('HIS-01')
    expect(screenIdFor('/big3/start', false)).toBe('BIG-02')
    expect(screenIdFor('/admin/usage', false)).toBe('ADMIN-02')
  })
  it('tells picking an exercise from recording sets', () => {
    expect(screenIdFor('/log', true)).toBe('REC-01')
    expect(screenIdFor('/log', false)).toBe('REC-02')
  })
  it('tells adding a past day from editing a workout', () => {
    expect(screenIdFor('/history/new', false)).toBe('HIS-03')
    expect(screenIdFor('/history/abc-123', false)).toBe('HIS-02')
  })
  it('names exercise details and ignores a trailing slash', () => {
    expect(screenIdFor('/exercises/e1', false)).toBe('EX-01')
    expect(screenIdFor('/ranking/', false)).toBe('RANK-01')
  })
  it('returns null for screens without an ID', () => {
    expect(screenIdFor('/strength', false)).toBeNull()
  })
})
