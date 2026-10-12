import { expect, test } from '@playwright/test'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
test.use({ userAgent: IPHONE })

test('a new iPhone user is shown how to add Glog to the home screen, and can find it again', async ({ page }) => {
  const uid = '77777777-7777-4777-8777-777777777777', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'new@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date(now).toISOString() }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(({ value, id }) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('sb-example-auth-token', JSON.stringify(value))
    localStorage.setItem('glog:install-after-signup:' + id, 'pending') // what sign-up leaves behind
  }, { value: session, id: uid })
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/announcements_seen_until')) return reply(new Date(now).toISOString())
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '新人' })
    return reply([])
  })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    const sheet = page.getByRole('dialog', { name: 'ホーム画面に追加しましょう' })
    if (width === 320) {
      await expect(sheet).toBeVisible()
      await expect(sheet).toContainText('ホーム画面に追加')
      await expect(sheet).toContainText('同じメールアドレスでログイン')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: 'test-results/install-guide-' + width + '.png' })
      await sheet.getByRole('button', { name: 'あとで' }).click()
      await expect(sheet).toBeHidden()
    } else {
      // Shown once: after a reload only the home card and the menu remain.
      await page.waitForTimeout(300)
      await expect(sheet).toBeHidden()
    }
    const card = page.getByRole('region', { name: 'ホーム画面に追加' })
    await expect(card).toBeVisible()
    await page.screenshot({ path: 'test-results/install-card-' + width + '.png', fullPage: true })
  }
  await page.getByRole('button', { name: /プロフィールメニュー/ }).click()
  await page.getByRole('button', { name: 'ホーム画面に追加' }).click()
  await expect(page.getByRole('dialog', { name: 'ホーム画面に追加しましょう' })).toBeVisible()
})
