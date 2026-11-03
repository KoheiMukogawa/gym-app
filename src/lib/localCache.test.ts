import { beforeEach, describe, expect, it } from 'vitest'
import { clearUserCache, isArray, readCache, removeCache, writeCache } from './localCache'

beforeEach(() => localStorage.clear())

describe('local cache', () => {
  it('reads back what was written for the same user only', () => {
    writeCache('u1', 'exercises', [{ id: 'bench' }])
    expect(readCache('u1', 'exercises', isArray)).toEqual([{ id: 'bench' }])
    expect(readCache('u2', 'exercises', isArray)).toBeUndefined()
    expect(readCache(null, 'exercises', isArray)).toBeUndefined()
  })

  it('ignores stored values of an old shape or a broken entry', () => {
    writeCache('u1', 'exercises', { not: 'a list' })
    expect(readCache('u1', 'exercises', isArray)).toBeUndefined()
    localStorage.setItem('glog:cache:u1:history', '{broken')
    expect(readCache('u1', 'history', isArray)).toBeUndefined()
    localStorage.setItem('glog:cache:u1:old', JSON.stringify({ v: 0, value: [] }))
    expect(readCache('u1', 'old', isArray)).toBeUndefined()
  })

  it('removes matching entries for everyone, and everything for one user on sign-out', () => {
    writeCache('u1', 'month:2026-11', [])
    writeCache('u2', 'month:2026-11', [])
    writeCache('u1', 'exercises', [])
    removeCache((name) => name.startsWith('month:'))
    expect(readCache('u1', 'month:2026-11', isArray)).toBeUndefined()
    expect(readCache('u2', 'month:2026-11', isArray)).toBeUndefined()
    expect(readCache('u1', 'exercises', isArray)).toEqual([])
    writeCache('u2', 'exercises', [])
    clearUserCache('u1')
    expect(readCache('u1', 'exercises', isArray)).toBeUndefined()
    expect(readCache('u2', 'exercises', isArray)).toEqual([])
  })
})
