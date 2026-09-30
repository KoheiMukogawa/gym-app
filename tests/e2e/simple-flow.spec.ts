import { expect, test, type Page } from '@playwright/test'

const USER = '11111111-1111-4111-8111-111111111111'
type SetRow = { id: string; workout_id: string; exercise_id: string; weight_kg: number; reps: number; set_index: number; created_at: string }
type WorkoutRow = { id: string; user_id: string; performed_at: string; created_at: string }
async function mockApi(page: Page) {
  const exercises = [
    { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'press', name: 'ダンベルベンチプレス', name_normalized: 'ダンベルベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'machine', name: 'チェストプレス', name_normalized: 'チェストプレス', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'fly', name: 'ダンベルフライ', name_normalized: 'ダンベルフライ', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', muscle_group: 'legs', is_preset: true, created_by: null },
    { id: 'legpress', name: 'レッグプレス', name_normalized: 'レッグプレス', muscle_group: 'legs', is_preset: true, created_by: null },
  ] as Array<{ id: string; name: string; name_normalized: string; muscle_group: string; is_preset: boolean; created_by: string | null }>
  const workouts: WorkoutRow[] = []
  const sets: SetRow[] = []
  const session = {
    access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }
  await page.route('https://example.supabase.co/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const table = url.pathname.split('/').at(-1)
    const method = req.method()
    const body = req.postData() ? req.postDataJSON() : null
    const eq = (key: string) => url.searchParams.get(key)?.replace(/^eq\./, '')
    const respond = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (method === 'OPTIONS') return route.fulfill({ status: 204 })
    if (table === 'token') return respond(session)
    if (table === 'user') return respond(session.user)
    if (table === 'logout') return respond({})
    if (table === 'profiles') return respond({ id: USER, display_name: 'テストユーザー' })
    if (table === 'exercises') {
      if (method === 'POST') {
        const next = { ...body, id: 'custom-' + exercises.length }
        exercises.push(next)
        return respond(next, 201)
      }
      return respond(exercises)
    }
    if (table === 'workouts') {
      if (method === 'POST') {
        const next = { ...body, id: body.id ?? 'workout-' + (workouts.length + 1), performed_at: body.performed_at ?? new Date().toISOString(), created_at: new Date().toISOString() }
        workouts.push(next)
        return respond(req.headers().accept?.includes('object') ? next : [next], 201)
      }
      const match = workouts.filter((w) => (!eq('id') || w.id === eq('id')) && (!eq('user_id') || w.user_id === eq('user_id')))
      if (method === 'PATCH') {
        match.forEach((w) => Object.assign(w, body))
        return respond(match[0])
      }
      if (method === 'DELETE') {
        const ids = match.map((w) => w.id)
        for (let i = workouts.length - 1; i >= 0; i--) if (ids.includes(workouts[i].id)) workouts.splice(i, 1)
        for (let i = sets.length - 1; i >= 0; i--) if (ids.includes(sets[i].workout_id)) sets.splice(i, 1)
        return respond(null)
      }
      const result = match.map((w) => ({
        ...w, profiles: { display_name: 'テストユーザー' },
        workout_sets: sets.filter((s) => s.workout_id === w.id).map((s) => ({ ...s, exercises: { name: exercises.find((e) => e.id === s.exercise_id)?.name } })),
      }))
      return respond(req.headers().accept?.includes('object') ? result[0] ?? null : result)
    }
    if (table === 'workout_sets') {
      const match = sets.filter((s) => (!eq('id') || s.id === eq('id')) && (!eq('workout_id') || s.workout_id === eq('workout_id')))
      if (method === 'POST') {
        const existing = sets.find((s) => s.id === body.id)
        if (existing) Object.assign(existing, body)
        else sets.push({ ...body, created_at: new Date().toISOString() })
        return respond(req.headers().accept?.includes('object') ? { id: body.id } : null, 201)
      }
      if (method === 'PATCH') { match.forEach((s) => Object.assign(s, body)); return respond(match[0]) }
      if (method === 'DELETE') {
        const ids = match.map((s) => s.id)
        for (let i = sets.length - 1; i >= 0; i--) if (ids.includes(sets[i].id)) sets.splice(i, 1)
        return respond(null)
      }
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/' + match.length }, body: '' })
      return respond([...match].reverse())
    }
    return respond([])
  })
  await page.goto('/')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page.getByRole('heading', { name: '今日のトレーニング' })).toBeVisible()
  return { sets, workouts, exercises }
}

test('mobile: direct logging, body groups, past dates, editing and deletion', async ({ page }) => {
  const data = await mockApi(page)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '設定', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'メンバー', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'トレーニング開始', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'ベンチプレス', exact: true }).click()
  await page.getByRole('spinbutton', { name: '重量', exact: true }).fill('62.5')
  await page.getByRole('spinbutton', { name: '回数', exact: true }).fill('8')
  await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  await expect.poll(() => data.sets.length).toBe(1)
  expect(data.sets[0].weight_kg).toBe(62.5)
  expect(data.sets[0].reps).toBe(8)
  await page.screenshot({ path: 'test-results/log-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '終了', exact: true }).click()
  await expect(page).toHaveURL(/\/history$/)
  await page.getByRole('link', { name: '編集', exact: true }).click()
  await page.getByRole('button', { name: /62.5kg 8回を編集/ }).click()
  await page.getByRole('spinbutton', { name: '重量（kg）' }).fill('65')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByRole('button', { name: /65kg 8回を編集/ })).toBeVisible()
  await page.getByRole('button', { name: '完了', exact: true }).click()
  await page.getByRole('link', { name: /日付を選んで追加/ }).click()
  await page.getByLabel('トレーニング日').fill('2020-02-03')
  await page.getByRole('button', { name: '脚', exact: true }).click()
  await page.getByRole('button', { name: 'スクワット', exact: true }).click()
  await page.getByRole('spinbutton', { name: '重量（kg）' }).fill('100')
  await page.getByRole('button', { name: 'セットを追加', exact: true }).click()
  await expect(page.getByRole('button', { name: /100kg 10回を編集/ })).toBeVisible()
  expect(new Date(data.workouts[1].performed_at).getFullYear()).toBe(2020)
  await page.getByLabel('トレーニング日').fill('2020-02-04')
  await page.getByRole('button', { name: '日付の変更を保存' }).click()
  await expect(page.getByRole('button', { name: '日付の変更を保存' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/history-editor-mobile.png', fullPage: true })
  await page.reload()
  await expect(page.getByLabel('トレーニング日')).toHaveValue('2020-02-04')
  await page.getByRole('link', { name: '履歴', exact: true }).click()
  await expect(page.getByRole('link', { name: '編集', exact: true })).toHaveCount(2)
  await page.getByRole('link', { name: '編集', exact: true }).last().click()
  await expect(page.getByLabel('トレーニング日')).toHaveValue('2020-02-04')
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /100kg 10回を削除/ }).click()
  await expect(page.getByRole('button', { name: /100kg 10回を編集/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'この記録を削除', exact: true }).click()
  await expect(page).toHaveURL(/\/history$/)
  expect(data.workouts).toHaveLength(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('personal exercise creation stays in the chosen body group', async ({ page }) => {
  const data = await mockApi(page)
  await page.getByRole('button', { name: '肩', exact: true }).click()
  await page.getByRole('button', { name: /肩の種目を追加/ }).click()
  await page.getByRole('textbox', { name: '種目名' }).fill('ケーブルサイドレイズ')
  await page.getByRole('button', { name: '追加して記録' }).click()
  await expect(page.getByRole('button', { name: /ケーブルサイドレイズ.*種目を変える/ })).toBeVisible()
  expect(data.exercises.at(-1)).toMatchObject({ muscle_group: 'shoulders', created_by: USER, is_preset: false })
  await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  await expect.poll(() => data.sets.length).toBe(1)
  await page.getByRole('button', { name: '終了', exact: true }).click()
  await page.getByRole('link', { name: '記録', exact: true }).click()
  await page.getByRole('button', { name: '肩', exact: true }).click()
  await expect(page.getByRole('region', { name: '肩の種目' }).getByRole('button', { name: /ケーブルサイドレイズ/ })).toBeVisible()
})
