import { expect, test, type Page } from '@playwright/test'

const USER = '11111111-1111-4111-8111-111111111111'
const DAY = 86400000

/** 約2年分・133日の記録（5日おき、最新は今日）。 */
function history() {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Array.from({ length: 133 }, (_, i) => {
    const at = new Date(today.getTime() - (132 - i) * 5 * DAY).toISOString()
    return { id: 's' + i, workout_id: 'w' + i, exercise_id: 'bench', set_index: 1, weight_kg: 60 + i * 0.4 + (i % 5) * 4, reps: 3, created_at: at, workouts: { user_id: USER, performed_at: at } }
  })
}

async function openBench(page: Page) {
  const sets = history()
  const session = {
    access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }
  await page.route('https://example.supabase.co/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    const respond = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (table === 'token') return respond(session)
    if (table === 'user') return respond(session.user)
    if (table === 'profiles') return respond({ id: USER, display_name: 'テストユーザー' })
    if (table === 'exercises') return respond(url.searchParams.get('id') ? [{ id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null }] : [])
    if (table === 'workout_sets' && url.searchParams.get('exercise_id')) return respond(sets)
    return respond([])
  })
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page.getByRole('region', { name: '今月のトレーニング' })).toBeVisible()
  await page.evaluate(() => { history.pushState({}, '', '/exercises/bench'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('heading', { name: 'ベンチプレス', exact: true })).toBeVisible()
  await expect(page.locator('.recharts-line-curve')).toBeVisible()
}

/** 表示中の期間の文字（例: 26/04/08〜26/10/05）。 */
const shownRange = (page: Page) => page.locator('[data-testid="trend-chart"]').locator('xpath=preceding-sibling::div[1]/p').innerText()

async function touch(page: Page, steps: { x: number; y: number }[][]) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: steps[0] })
  for (const points of steps.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('long strength history is zoomed with two fingers and moved with one', async ({ page }) => {
  await openBench(page)
  const chart = page.getByTestId('trend-chart')
  // 最初は直近6ヶ月。点を省いた線だけで、線の描画アニメーションが見える。
  await expect(page.locator('.recharts-line-dot')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '全期間' })).toBeVisible()
  await expect(chart).toHaveCSS('touch-action', 'pan-y')
  await page.screenshot({ path: 'test-results/exercise-chart-initial.png', fullPage: true })

  await page.getByRole('button', { name: '全期間' }).click()
  const whole = await shownRange(page)
  await expect(page.getByRole('button', { name: '全期間' })).toHaveCount(0)

  // 2本指を広げると拡大する。
  const box = (await chart.boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await touch(page, Array.from({ length: 8 }, (_, i) => [{ x: cx - 20 - i * 15, y: cy }, { x: cx + 20 + i * 15, y: cy }]))
  await expect(page.getByRole('button', { name: '全期間' })).toBeVisible()
  const zoomed = await shownRange(page)
  expect(zoomed).not.toBe(whole)
  await expect(page.getByText(/の記録$/)).toHaveCount(0)

  // 拡大中は1本指を右へなぞると過去へ移る。
  await touch(page, Array.from({ length: 8 }, (_, i) => [{ x: cx - 60 + i * 20, y: cy }]))
  const moved = await shownRange(page)
  expect(moved < zoomed).toBe(true)
  await expect(page.getByText(/の記録$/)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/exercise-chart-zoomed.png', fullPage: true })

  // タップでその日の記録を開く。
  // Recharts learns which day is under the finger from its hover state, which lags under load; retry the tap.
  await expect(async () => {
    await page.waitForTimeout(600)
    await touch(page, [[{ x: cx, y: cy }]])
    await expect(page.getByText(/^\d{4}-\d{2}-\d{2} の記録$/)).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 15_000 })

  // ダブルタップで全期間に戻る。Under load the two taps can land more than 300ms apart; retry the pair.
  await expect(async () => {
    await page.waitForTimeout(600)
    await touch(page, [[{ x: cx, y: cy }]])
    await touch(page, [[{ x: cx, y: cy }]])
    await expect(page.getByRole('button', { name: '全期間' })).toHaveCount(0, { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
  expect(await shownRange(page)).toBe(whole)

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(chart).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/exercise-chart-${width}.png`, fullPage: true })
  }
})

test('a mouse click on the chart opens that day', async ({ page }) => {
  await openBench(page)
  const box = (await page.getByTestId('trend-chart').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByText(/^\d{4}-\d{2}-\d{2} の記録$/)).toBeVisible()
})
