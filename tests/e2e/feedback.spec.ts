import { expect, test } from '@playwright/test'

test('a user sends feedback from the profile and an admin marks it read', async ({ page }) => {
  const uid = '44444444-4444-4444-8444-444444444444', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  const longUrl = 'https://example.com/' + 'a'.repeat(300)
  const sent: unknown[] = [], marked: unknown[] = [], answered: unknown[] = []
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/rest/v1/feedback') && req.method() === 'POST') {
      const body = req.postDataJSON(); sent.push(body)
      return reply({ id: 'f2', body: body.body, created_at: new Date().toISOString(), read_at: null }, 201)
    }
    if (path.endsWith('/rest/v1/feedback')) return reply([{ id: 'f1', body: '前に送った意見', created_at: '2026-10-04T03:00:00Z', read_at: '2026-10-04T04:00:00Z' }])
    if (path.endsWith('/rest/v1/admins')) return reply([{ user_id: uid }])
    if (path.endsWith('/admin_unread_feedback_count')) return reply(marked.length ? 0 : 1)
    if (path.endsWith('/admin_list_feedback')) return reply([{ id: 'f9', body: `記録画面が重い ${longUrl}`, user_agent: 'TestAgent/1.0', created_at: '2026-10-05T00:30:00Z', read_at: null, display_name: '利用者A' }])
    if (path.endsWith('/admin_mark_feedback_read')) { marked.push(req.postDataJSON()); return route.fulfill({ status: 204 }) }
    if (path.endsWith('/admin_reply_feedback')) { answered.push(req.postDataJSON()); return reply('2026-10-13T00:00:00+00:00') }
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '運営' })
    if (path.endsWith('/community_profiles')) return reply({ user_id: uid, display_name: '運営', icon: 'initials', bio: '', global_ranking: false })
    return reply([])
  })
  const fitsWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

  await page.goto('/')
  await page.getByRole('button', { name: 'プロフィールメニュー（新着の意見があります）' }).click()
  await page.getByRole('link', { name: 'ご意見・不具合を送る' }).click()
  await expect(page.getByRole('heading', { name: 'ご意見・不具合の報告' })).toBeVisible()
  await expect(page.getByText(/運営が確認済み/)).toBeVisible()
  await page.getByLabel('内容').fill(`  休憩タイマーがほしい ${longUrl}  `)
  await page.getByRole('button', { name: '送信する' }).click()
  await expect(page.getByText('送信しました。ありがとうございます')).toBeVisible()
  await expect(page.getByText(/休憩タイマーがほしい/)).toBeVisible()
  await expect(page.getByLabel('内容')).toHaveValue('')
  expect(sent).toEqual([{ body: `休憩タイマーがほしい ${longUrl}`, user_agent: expect.any(String) }])
  expect(await fitsWidth()).toBe(true)

  await page.goto('/profile')
  await expect(page.getByText('新着 1')).toBeVisible()
  await page.getByRole('link', { name: /届いた意見/ }).click()
  await expect(page.getByRole('heading', { name: '届いた意見' })).toBeVisible()
  await expect(page.getByText('利用者A')).toBeVisible()
  expect(await fitsWidth()).toBe(true)
  await page.getByRole('button', { name: '既読にする' }).click()
  await expect(page.getByText('未読 0件')).toBeVisible()
  expect(marked).toEqual([{ p_id: 'f9' }])
  await expect(page.getByRole('button', { name: 'プロフィールメニュー', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  // The admin answers with a status and a reply.
  await page.getByRole('button', { name: '対応中', exact: true }).click()
  await page.getByLabel(/返信（任意）/).fill('原因を調べています')
  await page.getByRole('button', { name: '返信する', exact: true }).click()
  await expect(page.getByText(/返信済み/)).toBeVisible()
  expect(answered).toEqual([{ p_id: 'f9', p_status: 'in_progress', p_reply: '原因を調べています' }])
  expect(await fitsWidth()).toBe(true)
  await page.screenshot({ path: 'test-results/feedback-admin-reply.png', fullPage: true })
  await page.getByRole('button', { name: 'プロフィールメニュー', exact: true }).click()
  await expect(page.getByRole('link', { name: '届いた意見', exact: true })).toBeVisible()
})

test('a sender is told about a reply once at launch and reads it on the feedback page', async ({ page }) => {
  const uid = '55555555-5555-4555-8555-555555555555', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'sender@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  let seen = 0
  const note = () => ({ id: 'f1', body: '重量を1kg刻みで選びたい', created_at: '2026-10-12T03:00:00Z', read_at: '2026-10-12T04:00:00Z',
    status: 'done', reply: '1kg単位で記録している種目は、ダイヤルが1kg刻みになりました', replied_at: '2026-10-13T00:00:00Z', reply_seen_at: seen ? '2026-10-13T01:00:00Z' : null })
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/rest/v1/feedback')) return reply([note()])
    if (path.endsWith('/mark_my_feedback_replies_seen')) { seen++; return route.fulfill({ status: 204 }) }
    if (path.endsWith('/announcements_seen_until')) return reply(new Date(now).toISOString())
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '送った人' })
    return reply([])
  })
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: 'ご意見への返信' })
  await expect(sheet).toContainText('対応済み')
  await expect(sheet).toContainText('ダイヤルが1kg刻みになりました')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/feedback-reply-sheet.png' })
  // Closing the sheet keeps the ring and the menu mark, as with an admin's new notes.
  await sheet.getByRole('button', { name: '閉じる' }).last().click()
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'プロフィールメニュー（ご意見に返信があります）' }).click()
  await page.getByRole('link', { name: /ご意見・不具合を送る.*返信 1/ }).click()
  await expect(page.getByRole('heading', { name: 'ご意見・不具合の報告' })).toBeVisible()
  await expect(page.getByLabel('運営からの返信')).toContainText('1kg刻み')
  await expect.poll(() => seen).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'プロフィールメニュー', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('運営からの返信')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'ご意見への返信' })).toHaveCount(0)
})
