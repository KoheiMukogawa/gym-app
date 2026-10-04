import { expect, test } from '@playwright/test'

test('join global and DOTS rankings on mobile without visiting profile', async ({ page }) => {
  const uid = '11111111-1111-4111-8111-111111111111'
  let mine = { user_id: uid, display_name: 'テスト利用者', icon: 'target', bio: '目標', global_ranking: false, dots_opt_in: false, dots_formula: null as string | null }
  const writes: string[] = []
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {} } }
  await page.route('https://example.supabase.co/**', async route => {
    const request = route.request()
    const endpoint = new URL(request.url()).pathname.split('/').at(-1)
    const body = request.postData() ? request.postDataJSON() : null
    const send = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (endpoint === 'token') return send(session)
    if (endpoint === 'user') return send(session.user)
    if (endpoint === 'profiles') return send({ id: uid, display_name: mine.display_name, icon: mine.icon })
    if (endpoint === 'community_profiles') return send(mine)
    if (endpoint === 'community_list') return send([])
    if (endpoint === 'save_glog_profile') {
      writes.push(endpoint)
      mine = { ...mine, display_name: body.p_name, icon: body.p_icon, bio: body.p_bio, global_ranking: body.p_global }
      return send(null)
    }
    if (endpoint === 'save_dots_settings') {
      writes.push(endpoint)
      mine = { ...mine, dots_opt_in: body.p_opt_in, dots_formula: body.p_formula }
      return send(null)
    }
    if (endpoint === 'global_ranking') {
      const member = (id: string, name: string) => ({ user_id: id, display_name: name, icon: 'target', bio: '', total: 500, growth: 20, dots: 350, dots_opt_in: true, lifts: { squat: 150, bench: 100, deadlift: 250 }, points: [] })
      return send([member('other', '参加者'), ...(mine.global_ranking ? [{ ...member(uid, mine.display_name), dots_opt_in: mine.dots_opt_in }] : [])])
    }
    return send([])
  })
  await page.goto('/strength?view=ranking')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page.getByRole('region', { name: '今月のトレーニング' })).toBeVisible()
  await page.goto('/strength?view=ranking')
  await expect(page.getByRole('button', { name: '公開して参加する', exact: true })).toBeVisible()
  await expect(page.locator('[inert]')).toHaveCSS('filter', 'blur(3px)')
  await page.screenshot({ path: 'test-results/ranking-invitation-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '公開して参加する', exact: true }).click()
  await expect(page.getByRole('form', { name: 'ランキングへの参加' })).toContainText('メモは公開されません')
  expect(writes).toEqual([])
  await page.getByRole('button', { name: '公開に同意して参加する' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'テスト利用者' })).toBeVisible()
  await page.getByRole('button', { name: 'DOTS', exact: true }).click()
  await expect(page.getByText(/DOTSは、体重の違いを補正して筋力を比較するスコア/)).toBeVisible()
  const guide = page.getByRole('table', { name: 'DOTSスコアの目安' })
  const summary = page.locator('summary', { hasText: 'スコアの目安' })
  await expect(guide).toBeHidden()
  await summary.click()
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('row')).toHaveCount(8)
  await expect(page.getByText(/DOTSに公式のレベル区分はありません/)).toBeVisible()
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(56)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await summary.evaluate(element => element.scrollIntoView({ block: 'start' }))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/dots-guide-${width}.png` })
  }
  await summary.focus()
  await summary.press('Enter')
  await expect(guide).toBeHidden()
  expect(writes).toEqual(['save_glog_profile'])
  await page.getByRole('button', { name: '係数を選んで参加する' }).click()
  await expect(page.getByRole('button', { name: '公開に同意して参加する' })).toBeDisabled()
  await expect(page.getByRole('form', { name: 'ランキングへの参加' })).toContainText('体重の公開にも同意')
  await page.getByRole('radio', { name: '男性用' }).check()
  await page.screenshot({ path: 'test-results/ranking-dots-consent-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '公開に同意して参加する' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'テスト利用者' })).toContainText('350.0')
  expect(writes).toEqual(['save_glog_profile', 'save_dots_settings'])
  expect(mine).toMatchObject({ global_ranking: true, dots_opt_in: true, dots_formula: 'male', bio: '目標', icon: 'target' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
