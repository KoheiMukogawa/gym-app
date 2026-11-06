import { expect, test } from '@playwright/test'
import type { Member } from '../../src/features/community/queries'

// 通報→続けてブロック→ランキングから消える→プロフィールで解除→戻る（App Storeの審査ガイドライン1.2）
test('report a member, block them, and unblock from the profile', async ({ page }) => {
  const uid = '11111111-1111-4111-8111-111111111111'
  const mine = { user_id: uid, display_name: 'コウヘイ', icon: 'initials', bio: '', global_ranking: true, dots_opt_in: false, dots_formula: null }
  const other: Member = { user_id: 'other', display_name: 'ジム仲間', icon: 'initials', bio: '', total: 450, growth: null, dots: null, dots_opt_in: false, lifts: { squat: 160, bench: 100, deadlift: 190 }, points: [] }
  const me: Member = { ...mine, total: 400, growth: null, dots: null, lifts: { squat: 150, bench: 90, deadlift: 160 }, points: [] }
  const blocked = new Set<string>()
  const reports: unknown[] = []
  const session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {} } }
  await page.route('https://example.supabase.co/**', async (route) => {
    const req = route.request(), endpoint = new URL(req.url()).pathname.split('/').at(-1)
    const body = req.postData() ? req.postDataJSON() : null
    const send = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (endpoint === 'token') return send(session)
    if (endpoint === 'user') return send(session.user)
    if (endpoint === 'profiles') return send({ id: uid, display_name: 'コウヘイ', icon: 'initials' })
    if (endpoint === 'community_profiles') return send(mine)
    if (endpoint === 'global_ranking') return send([me, other].filter((m) => !blocked.has(m.user_id)))
    if (endpoint === 'report_user') { reports.push(body); return send(null) }
    if (endpoint === 'block_user') { blocked.add(body.p_target); return send(null) }
    if (endpoint === 'unblock_user') { blocked.delete(body.p_target); return send(null) }
    if (endpoint === 'list_blocked_users') return send([...blocked].map((id) => ({ user_id: id, display_name: 'ジム仲間', icon: 'initials', blocked_at: '2026-11-06T00:00:00Z' })))
    return send([])
  })
  await page.goto('/strength?view=ranking')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto('/strength?view=ranking')
  const ranking = page.getByRole('region', { name: '全体ランキング' })
  await ranking.getByRole('button', { name: /ジム仲間/ }).click()

  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: '通報する' }).click()
  await sheet.getByRole('radio', { name: '不適切な名前' }).check()
  await sheet.getByRole('textbox', { name: '詳しい内容（任意）' }).fill('名前が不快です')
  await sheet.getByRole('button', { name: '通報する' }).click()
  await expect(sheet.getByText('通報しました。運営が確認します。')).toBeVisible()
  expect(reports).toEqual([{ p_target: 'other', p_reason: 'name', p_detail: '名前が不快です' }])

  await sheet.getByRole('button', { name: 'この人をブロックする' }).click()
  await sheet.getByRole('button', { name: 'ブロックする' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(ranking.getByRole('button', { name: /ジム仲間/ })).toHaveCount(0)
  await expect(ranking.getByRole('button', { name: /コウヘイ/ })).toBeVisible()

  await page.goto('/profile')
  const list = page.getByRole('region', { name: 'ブロックした人' })
  await expect(list.getByText('ジム仲間')).toBeVisible()
  await list.getByRole('button', { name: 'ジム仲間のブロックを解除' }).click()
  await expect(list.getByText(/ブロックした人はいません/)).toBeVisible()

  await page.goto('/strength?view=ranking')
  await expect(page.getByRole('region', { name: '全体ランキング' }).getByRole('button', { name: /ジム仲間/ })).toBeVisible()
})
