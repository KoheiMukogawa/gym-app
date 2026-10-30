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
    if (path.endsWith('/admin_growth_stats')) return reply({ weekly_active_lifters: 2, previous_weekly_active_lifters: 1,
      lifters_2plus_days_7d: 1, previous_lifters_2plus_days_7d: 0, workouts_7d: 3, previous_workouts_7d: 1,
      sets_7d: 30, previous_sets_7d: 12, signups_7d: 1, previous_signups_7d: 0,
      activation: { registered: 6, first_workout: 4, second_workout_day: 3 },
      retention: { d1: { eligible: 4, retained: 2 }, d7: { eligible: 3, retained: 1 }, d30: { eligible: 0, retained: 0 } },
      signups_by_source_90d: [{ source: 'calc-1rm', signups: 2 }] })
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '運営' })
    return reply([])
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'プロフィールメニュー' }).click()
  await expect(page.getByRole('heading', { name: 'データとアプリ' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'サポート' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '管理' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: '利用状況' }).click()
  await expect(page.getByRole('heading', { name: '利用状況' })).toBeVisible()
  await expect(page.getByText('直近7日間')).toBeVisible()
  await expect(page.getByTestId('activation-chart').getByText('初回記録')).toBeVisible()
  await expect(page.getByTestId('weekly-active-chart').locator('.recharts-bar-rectangle')).toHaveCount(9)
  await expect(page.getByTestId('activation-chart').locator('.recharts-bar-rectangle')).toHaveCount(3)
  await expect(page.getByRole('article')).toHaveCount(12)
  await expect(page.getByText('翌日').locator('+ dd')).toHaveText('2/4人（50%）')
  await expect(page.getByRole('row', { name: /1RM計算/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
