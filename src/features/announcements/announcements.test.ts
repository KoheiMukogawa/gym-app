import { describe, expect, it } from 'vitest'
import { ANNOUNCEMENTS, unreadAnnouncements, type Announcement } from './announcements'

const item = (id: string, publishedAt: string): Announcement => ({ id, publishedAt, title: id, body: '' })
const items = [item('old', '2026-10-01T12:00:00+09:00'), item('new', '2026-10-05T12:00:00+09:00'), item('future', '2026-12-01T12:00:00+09:00')]
const now = new Date('2026-10-06T00:00:00+09:00')

describe('unreadAnnouncements', () => {
  it('shows only what was published after the baseline and not in the future, newest first', () => {
    expect(unreadAnnouncements(items, '2026-09-01T00:00:00Z', now).map((a) => a.id)).toEqual(['new', 'old'])
    expect(unreadAnnouncements(items, '2026-10-03T00:00:00Z', now).map((a) => a.id)).toEqual(['new'])
  })
  it('treats an announcement published exactly at the baseline as seen', () => {
    expect(unreadAnnouncements(items, '2026-10-05T03:00:00Z', now)).toEqual([])
  })
  it('shows nothing for an unreadable baseline', () => {
    expect(unreadAnnouncements(items, 'not a date', now)).toEqual([])
  })
})

describe('ANNOUNCEMENTS', () => {
  it('has unique ids and Japan-time publication dates', () => {
    expect(new Set(ANNOUNCEMENTS.map((a) => a.id)).size).toBe(ANNOUNCEMENTS.length)
    for (const a of ANNOUNCEMENTS) {
      expect(a.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/)
      expect(Number.isNaN(Date.parse(a.publishedAt))).toBe(false)
    }
  })
})
