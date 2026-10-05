import { expect, test } from '@playwright/test'

test('an existing user sees the new feature once and opens it', async ({ page }) => {
  const uid = '66666666-6666-4666-8666-666666666666', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'member@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  let seenUntil = '2026-01-01T00:00:00+00:00', marks = 0
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/announcements_seen_until')) return reply(seenUntil)
    if (path.endsWith('/mark_announcements_seen')) { marks++; seenUntil = new Date().toISOString(); return route.fulfill({ status: 204 }) }
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '利用者' })
    return reply([])
  })
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: '新しい機能' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'ご意見・不具合を送れるようになりました' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await sheet.getByRole('button', { name: 'ご意見を送る' }).click()
  await expect(page.getByRole('heading', { name: 'ご意見・不具合の報告' })).toBeVisible()
  await expect(sheet).toBeHidden()
  expect(marks).toBe(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'ご意見・不具合の報告' })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog', { name: '新しい機能' })).toBeHidden()
})
