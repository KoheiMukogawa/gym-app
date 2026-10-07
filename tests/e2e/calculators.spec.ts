import { expect, test } from '@playwright/test'

test('a visitor finds the calculators from the introduction, gets a result, and is led to sign up', async ({ page }) => {
  await page.route('https://example.supabase.co/**', route => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204 }) : route.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.goto('/')
  await page.getByRole('link', { name: '1RM計算' }).click()
  await expect(page).toHaveTitle(/1RM計算/)
  await page.getByLabel('重量').fill('80')
  await page.getByLabel('回数').fill('8')
  await expect(page.locator('dt', { hasText: /^推定1RM$/ }).locator('+ dd')).toHaveText('99.3kg')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.getByRole('contentinfo').getByRole('link', { name: 'DOTS計算' }).click()
  await page.getByLabel('体重').fill('80')
  await page.getByLabel('BIG3トータル').fill('500')
  await expect(page.locator('dt', { hasText: /^DOTS$/ }).locator('+ dd')).toHaveText('344.8')
  await page.getByRole('link', { name: '無料でGlogに記録する' }).click()
  await expect(page).toHaveURL(/\/signup\?from=calc-dots$/)
  await expect(page.getByRole('heading', { name: 'プロフィールを作って始める' })).toBeVisible()
  // The first public page visited is what sign-up will report as its source.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('glog:first-touch') ?? '{}').source)).toBe('landing')
})
