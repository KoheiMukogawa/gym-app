import type { Locator, Page } from '@playwright/test'

export async function enterWheelValue(page: Page, label: string, value: string) {
  await page.getByRole('button', { name: `${label}を直接入力`, exact: true }).click()
  const input = page.getByRole('spinbutton', { name: label, exact: true })
  await input.fill(value)
  await input.press('Tab')
}

/** Moves the dial one row, as the arrow keys do. */
export async function nudgeWheel(scope: Page | Locator, label: string, direction: 'up' | 'down') {
  const wheel = scope.getByRole('spinbutton', { name: label, exact: true })
  await wheel.focus()
  await wheel.press(direction === 'up' ? 'ArrowUp' : 'ArrowDown')
}
