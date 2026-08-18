import { expect, test } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? ''
const PASSWORD = process.env.E2E_PASSWORD ?? ''

test.describe('中核の記録導線', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL と E2E_PASSWORD が未設定')

  test('ログインしてセットを記録し、フィードに反映される', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('メールアドレス').fill(EMAIL)
    await page.getByLabel('パスワード').fill(PASSWORD)
    await page.getByRole('button', { name: 'ログイン' }).click()

    const startLink = page.getByRole('link', { name: 'トレーニング開始' })
    await expect(startLink).toBeVisible()
    await startLink.click()

    await page.getByRole('searchbox', { name: '種目を検索' }).fill('ベンチプレス')
    await page.getByRole('button', { name: /ベンチプレス/ }).first().click()

    await page.getByRole('button', { name: '重量を増やす' }).click()
    await page.getByRole('button', { name: 'セット完了' }).click()

    await expect(page.getByRole('button', { name: /記録しました/ })).toBeVisible()
    await expect(page.getByRole('listitem').first()).toContainText('1セット目')

    await page.getByRole('button', { name: '終了' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('ベンチプレス').first()).toBeVisible()
  })
})
