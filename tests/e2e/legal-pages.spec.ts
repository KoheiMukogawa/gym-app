import { expect, test } from '@playwright/test'

test('the terms and the privacy policy open from the introduction and from signup', async ({ page }) => {
  await page.route('https://example.supabase.co/**', route => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204 }) : route.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.goto('/')
  await page.getByRole('link', { name: '利用規約' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '利用規約' })).toBeVisible()
  await expect(page.getByText(/京都地方裁判所/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.goto('/signup')
  await page.getByRole('link', { name: 'プライバシーポリシー' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '日本（東京リージョン）' })).toBeVisible()
  // The wide tables scroll inside their box; the page itself must not scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('privacy-mobile.png'), fullPage: true })
})
