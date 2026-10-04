import { expect, test, type Page } from '@playwright/test'

const user = { id: '22222222-2222-4222-8222-222222222222', aud: 'authenticated', role: 'authenticated', email: 'me@example.com',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }

// Stands in for Supabase Auth: records what the app sends and answers like the real endpoints.
async function mockAuth(page: Page) {
  const calls: { path: string; body: unknown }[] = []
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.startsWith('/auth/v1/')) calls.push({ path, body: req.postDataJSON() })
    if (path.endsWith('/recover')) return reply({})
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/profiles')) return reply({ id: user.id, display_name: '本人' })
    return reply([])
  })
  return calls
}

// What Supabase puts on the redirect after the email link is opened (implicit flow).
const recoveryHash = () => '#' + new URLSearchParams({ access_token: 'recovery-access-token', refresh_token: 'recovery-refresh-token',
  expires_in: '3600', expires_at: String(Math.floor(Date.now() / 1000) + 3600), token_type: 'bearer', type: 'recovery' })

test('a forgotten password is reset from the emailed link', async ({ page }) => {
  const calls = await mockAuth(page)
  await page.goto('/login')
  await page.getByRole('link', { name: 'パスワードを忘れた方' }).click()
  await page.getByLabel('メールアドレス').fill('me@example.com')
  await page.getByRole('button', { name: '再設定メールを送る' }).click()
  await expect(page.getByRole('status')).toContainText('再設定用のメールを送りました')
  expect(calls.find(call => call.path.endsWith('/recover'))?.body).toMatchObject({ email: 'me@example.com' })

  await page.goto('/reset-password' + recoveryHash())
  await page.getByLabel('新しいパスワード').fill('new-password-123')
  await page.getByRole('button', { name: 'パスワードを変更' }).click()
  await expect(page.getByText('パスワードを変更しました')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  expect(calls.find(call => call.path.endsWith('/user') && call.body)?.body).toMatchObject({ password: 'new-password-123' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a reset link that lands on the home page still asks for the new password', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/' + recoveryHash())
  await expect(page).toHaveURL(/\/reset-password$/)
  await expect(page.getByLabel('新しいパスワード')).toBeVisible()
})

test('an expired reset link offers to send a new one', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByRole('alert')).toContainText('有効期限が切れているか')
  await page.getByRole('link', { name: '再設定メールを送り直す' }).click()
  await expect(page.getByRole('button', { name: '再設定メールを送る' })).toBeVisible()
})
