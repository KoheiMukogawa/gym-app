import { expect, test } from '@playwright/test'

test('a user votes from the launch sheet, sees the results and finds them again in the menu', async ({ page }) => {
  const uid = '77777777-7777-4777-8777-777777777777', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'member@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  const votes: Record<string, number> = { glog: 1, 'barbell-club': 2 }
  let mine: string | null = null
  const poll = () => ({
    id: 'b0110000-0000-4000-8000-000000000001', question: 'アプリの名前はどちらがいいですか？',
    description: '使っているマッチョ達と一緒に、アプリの名前を決めたいと思います。結果を参考に運営が決めます。',
    starts_at: new Date(now - 3600_000).toISOString(), ends_at: new Date(now + 3 * 86400_000).toISOString(), my_option: mine,
    total_votes: mine ? votes.glog + votes['barbell-club'] : null,
    options: [{ id: 'glog', label: 'Glog', votes: mine ? votes.glog : null }, { id: 'barbell-club', label: 'BARBELL CLUB', votes: mine ? votes['barbell-club'] : null }],
  })
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/announcements_seen_until')) return reply(new Date(now).toISOString())
    if (path.endsWith('/list_polls')) return reply([poll()])
    if (path.endsWith('/vote_poll')) {
      const { p_option_id } = req.postDataJSON() as { p_option_id: string }
      mine = p_option_id; votes[p_option_id]++
      return route.fulfill({ status: 204 })
    }
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '利用者' })
    return reply([])
  })
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: 'マッチョ会議' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: '投票する' })).toBeDisabled()
  await sheet.getByRole('radio', { name: 'BARBELL CLUB' }).click()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/poll-sheet-${width}.png` })
  }
  page.once('dialog', dialog => {
    expect(dialog.message()).toBe('「BARBELL CLUB」に投票します。投票はあとから変えられません。')
    void dialog.accept()
  })
  await sheet.getByRole('button', { name: '投票する' }).click()
  const results = sheet.getByRole('list', { name: '結果' })
  await expect(results).toHaveText('Glog25%BARBELL CLUB75%あなたの投票')
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'test-results/poll-results-390.png' })
  await sheet.getByRole('button', { name: '閉じる' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: 'プロフィールメニュー' }).click()
  await page.getByRole('link', { name: '投票', exact: true }).click()
  await expect(page.getByRole('heading', { name: '投票', level: 1 })).toBeVisible()
  await expect(page.getByRole('list', { name: '結果' })).toContainText('BARBELL CLUB75%あなたの投票')
  await expect(page.getByText('票', { exact: false }).filter({ hasText: /\d票/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '投票', level: 1 })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog', { name: 'マッチョ会議' })).toBeHidden()
})
