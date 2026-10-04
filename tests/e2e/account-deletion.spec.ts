import { expect, test } from '@playwright/test'

test('a user deletes their account from the profile and lands on the introduction', async ({ page }) => {
  const uid = '33333333-3333-4333-8333-333333333333', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'leave@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  await page.addInitScript(id => localStorage.setItem(`gym-app.draft.${id}`, '{}'), uid)
  const deletions: unknown[] = []
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/account_deletion_summary')) return reply({ workout_days: 5, set_count: 40, body_log_count: 2,
      custom_exercise_count: 0, health_sync_connected: false, owned_communities: [{ name: '朝トレ部', other_member_count: 2 }] })
    if (path.endsWith('/delete_my_account')) { deletions.push(req.postDataJSON()); return route.fulfill({ status: 204 }) }
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '退会者' })
    if (path.endsWith('/community_profiles')) return reply({ user_id: uid, display_name: '退会者', icon: 'initials', bio: '', global_ranking: false })
    return reply([])
  })
  await page.goto('/profile')
  await page.getByRole('link', { name: '退会する' }).click()
  await expect(page.getByRole('heading', { name: '退会' })).toBeVisible()
  await expect(page.getByText('記録 5日分（40セット）')).toBeVisible()
  await expect(page.getByText(/「朝トレ部」も削除され、ほかのメンバー2人/)).toBeVisible()
  const button = page.getByRole('button', { name: '退会する' })
  await expect(button).toBeDisabled()
  await page.getByLabel('確認のため「退会する」と入力してください').fill('退会する')
  await button.click()
  await expect(page.getByText('退会しました')).toBeVisible()
  await expect(page.getByRole('heading', { name: /今日の積み重ね/ })).toBeVisible()
  expect(deletions).toEqual([{ p_confirm: '退会する' }])
  expect(await page.evaluate(id => [localStorage.getItem('sb-example-auth-token'), localStorage.getItem(`gym-app.draft.${id}`)], uid)).toEqual([null, null])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
