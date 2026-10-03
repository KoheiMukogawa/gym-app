import type { Page } from '@playwright/test'

export async function enterWheelValue(page: Page, label: string, value: string) {
  await page.getByRole('button', { name: `${label}を直接入力`, exact: true }).click()
  const input = page.getByRole('spinbutton', { name: label, exact: true })
  await input.fill(value)
  await input.press('Tab')
}
