import { describe, expect, it } from 'vitest'
import { logScreenFor, screenIdFor } from './screenIds'

describe('screenIdFor', () => {
  it('names fixed screens', () => {
    expect(screenIdFor('/', 'REC-01')).toBe('HOME-01')
    expect(screenIdFor('/history', 'REC-01')).toBe('HIS-01')
    expect(screenIdFor('/big3/start', 'REC-01')).toBe('BIG-02')
    expect(screenIdFor('/admin/usage', 'REC-01')).toBe('ADMIN-02')
  })
  it('tells picking an exercise from recording sets', () => {
    expect(screenIdFor('/log', 'REC-01')).toBe('REC-01')
    expect(screenIdFor('/log', 'REC-05')).toBe('REC-05')
    expect(logScreenFor('dial', true, false)).toBe('REC-01')
    expect(logScreenFor('dial', false, false)).toBe('REC-02')
    expect(logScreenFor('list', true, false)).toBe('REC-03')
    expect(logScreenFor('list', true, true)).toBe('REC-04')
    expect(logScreenFor('list', false, true)).toBe('REC-05')
  })
  it('tells adding a past day from editing a workout', () => {
    expect(screenIdFor('/history/new', 'REC-01')).toBe('HIS-03')
    expect(screenIdFor('/history/abc-123', 'REC-01')).toBe('HIS-02')
  })
  it('names exercise details and ignores a trailing slash', () => {
    expect(screenIdFor('/exercises/e1', 'REC-01')).toBe('EX-01')
    expect(screenIdFor('/ranking/', 'REC-01')).toBe('RANK-01')
  })
  it('returns null for screens without an ID', () => {
    expect(screenIdFor('/strength', 'REC-01')).toBeNull()
  })
})
