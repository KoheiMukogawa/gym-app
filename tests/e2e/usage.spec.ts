import { expect, test } from '@playwright/test'

test('an admin opens the usage dashboard from the profile menu', async ({ page }) => {
  const uid = '55555555-5555-4555-8555-555555555555', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 20 + 7 * i))
    return { week_start: d.toISOString().slice(0, 10), active_users: i % 4, workouts: i, sets: 10 * i, signups: i % 2 }
  })
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/rest/v1/admins')) return reply([{ user_id: uid }])
    if (path.endsWith('/admin_unread_feedback_count')) return reply(0)
    if (path.endsWith('/admin_usage_stats')) return reply({ total_users: 6, active_7d: 2, active_30d: 4, weeks })
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '運営' })
    return reply([])
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'プロフィールメニュー' }).click()
  await page.getByRole('link', { name: '利用状況' }).click()
  await expect(page.getByRole('heading', { name: '利用状況' })).toBeVisible()
  await expect(page.getByText('直近30日に記録した人')).toBeVisible()
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(9)
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(13)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
