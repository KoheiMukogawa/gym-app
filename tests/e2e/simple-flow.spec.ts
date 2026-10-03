import { expect, test, type Page, type Locator } from '@playwright/test'

async function holdDrag(page: Page, source: Locator, target: Locator, cancel = false) {
  await expect(source).toBeEnabled()
  await source.scrollIntoViewIfNeeded()
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const x = from.x + from.width / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from.y + from.height / 2 }] })
  await page.waitForTimeout(400)
  await expect(source).toHaveAttribute('aria-pressed', 'true')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: to.y + to.height / 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

const USER = '11111111-1111-4111-8111-111111111111'
type SetRow = { id: string; workout_id: string; exercise_id: string; weight_kg: number; reps: number; set_index: number; created_at: string }
type WorkoutRow = { id: string; user_id: string; performed_at: string; created_at: string }
async function mockApi(page: Page) {
  const bodyweights: { recorded_on: string; bodyweight_kg: number; body_fat_pct?: number | null }[] = []
  const exercises = [
    { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'chin', name: 'チンニング', name_normalized: 'チンニング', muscle_group: 'back', is_preset: true, created_by: null, is_bodyweight: true },
    { id: 'press', name: 'ダンベルベンチプレス', name_normalized: 'ダンベルベンチプレス', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'machine', name: 'チェストプレス', name_normalized: 'チェストプレス', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'fly', name: 'ダンベルフライ', name_normalized: 'ダンベルフライ', muscle_group: 'chest', is_preset: true, created_by: null },
    { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', muscle_group: 'legs', is_preset: true, created_by: null },
    { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', muscle_group: 'back', is_preset: true, created_by: null },
    { id: 'legpress', name: 'レッグプレス', name_normalized: 'レッグプレス', muscle_group: 'legs', is_preset: true, created_by: null },
  ] as Array<{ id: string; name: string; name_normalized: string; muscle_group: string; is_preset: boolean; created_by: string | null }>
  const workouts: WorkoutRow[] = []
  const sets: SetRow[] = []
  const goals: Array<{ id: string; user_id: string; label: string; target_date: string; target_total_kg: number; created_at: string }> = []
  const routines: Array<{id: string; user_id: string; name: string; exercise_ids: string[]}> = []
  let preference: { user_id: string; exercise_order: string[] } | null = null
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
    if (table === 'bodyweight_logs') {
      if (method === 'POST') { bodyweights.splice(0, bodyweights.length, ...bodyweights.filter((b) => b.recorded_on !== body.recorded_on), body); return respond(null, 201) }
      if (method === 'DELETE') { const i = bodyweights.findIndex((b) => b.recorded_on === eq('recorded_on')); if (i >= 0) bodyweights.splice(i, 1); return respond(null) }
      return respond(bodyweights)
    }
    if (table === 'strength_goals') {
      if (method === 'POST') {
        const existing = goals.find((g) => g.id === body.id)
        if (existing) Object.assign(existing, body)
        else goals.push({ ...body, created_at: new Date().toISOString() })
        return respond(goals.find((g) => g.id === body.id))
      }
      return respond(goals)
    }
    if (table === 'exercise_preferences') {
      if (method === 'POST') preference = body
      return respond(preference)
    }
    if (table === 'training_routines') {
      if (method === 'POST') {
        const index = routines.findIndex((r) => r.id === body.id)
        if (index >= 0) routines[index] = body
        else routines.push(body)
        return respond(body)
      }
      if (method === 'DELETE') {
        const index = routines.findIndex((r) => r.id === eq('id'))
        if (index >= 0) routines.splice(index, 1)
        return respond(null)
      }
      return respond(routines)
    }
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
      const filters = url.searchParams.getAll('performed_at')
      const result = match.filter((w) => filters.every((filter) =>
        filter.startsWith('gte.') ? w.performed_at >= filter.slice(4) :
        filter.startsWith('lt.') ? w.performed_at < filter.slice(3) : true)).map((w) => ({
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
      return respond([...match].reverse().map((s) => ({ ...s, workouts: { performed_at: workouts.find((w) => w.id === s.workout_id)?.performed_at ?? new Date().toISOString() } })))
    }
    return respond([])
  })
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  // The app opens on the home dashboard; the start button leads to recording.
  await expect(page.getByRole('region', { name: '今月のトレーニング' })).toBeVisible()
  await page.getByRole('link', { name: /本日のトレーニングを追加/ }).click()
  await expect(page.getByRole('heading', { name: '今日のトレーニング' })).toBeVisible()
  return { sets, workouts, exercises, routines, goals, bodyweights }
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
  await expect(page.getByText('推定1RM', { exact: false })).toBeVisible()
  await page.getByRole('spinbutton', { name: '重量', exact: true }).fill('80')
  await page.getByRole('spinbutton', { name: '回数', exact: true }).fill('6')
  await expect(page.getByText('92.9 kg', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '履歴', exact: true }).click()
  await page.getByRole('link', { name: 'ホーム', exact: true }).click()
  await page.getByRole('link', { name: /続きを記録|本日のトレーニングを追加/ }).click()
  await expect(page.getByRole('spinbutton', { name: '重量', exact: true })).toHaveValue('80')
  await expect(page.getByRole('spinbutton', { name: '回数', exact: true })).toHaveValue('6')
  const wheel=page.getByLabel('重量をスクロールで選択',{exact:true})
  await wheel.hover()
  await page.mouse.wheel(0,80)
  await expect(page.getByRole('spinbutton',{name:'重量',exact:true})).toHaveValue('85')
  // 重量を変えると回数が提案値に入れ替わるので、推定1RMの表示を見るために戻す
  await page.getByRole('spinbutton',{name:'回数',exact:true}).fill('6')
  await expect(page.getByText('98.7 kg',{exact:true})).toBeVisible()
  await page.screenshot({path:'test-results/log-mobile-redesigned.png',fullPage:true})
  await page.getByRole('button', { name: 'プロフィールメニュー', exact: true }).click()
  await expect(page.getByRole('button', { name: 'ログアウト', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Glog トップへ', exact: true }).click()
  await expect(page.getByRole('button', { name: 'ログアウト', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /続きを記録.*今日 1セット/ })).toBeVisible()
  await page.getByRole('link', { name: /続きを記録/ }).click()
  await page.getByRole('button', { name: '終了', exact: true }).click()
  // Finishing returns home, which lists today's workout.
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('region', { name: '今日のトレーニング' })).toContainText('ベンチプレス')
  await page.getByRole('link', { name: '履歴', exact: true }).click()
  await expect(page.getByRole('link', { name: '編集', exact: true })).toHaveCount(0)
  await expect(page.getByText('今月の記録')).toHaveCount(0)
  await page.getByRole('button', { name: /トレーニングあり/ }).click()
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
  // Creating a past workout navigates and refetches it; the optimistic row
  // alone does not mean that the saved-date reset has finished.
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname.endsWith('/workouts')
        && url.searchParams.get('id') === `eq.${data.workouts[1]?.id}`
    }),
    page.getByRole('button', { name: 'セットを追加', exact: true }).click(),
  ])
  await expect(page.getByRole('heading', { name: '記録を編集', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /100kg 10回を編集/ })).toBeVisible()
  expect(new Date(data.workouts[1].performed_at).getFullYear()).toBe(2020)
  await page.getByLabel('トレーニング日').fill('2020-02-04')
  await page.getByRole('button', { name: '日付の変更を保存' }).click()
  await expect(page.getByRole('button', { name: '日付の変更を保存' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/history-editor-mobile.png', fullPage: true })
  await page.reload()
  await expect(page.getByLabel('トレーニング日')).toHaveValue('2020-02-04')
  await page.getByRole('button', { name: '完了', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2020年2月' })).toBeVisible()
  await expect(page.getByRole('link', { name: '編集', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '2月5日', exact: true }).click()
  await expect(page.getByText('この日の記録はありません')).toBeVisible()
  await page.getByRole('link', { name: '＋ この日に記録を追加', exact: true }).click()
  await expect(page.getByLabel('トレーニング日')).toHaveValue('2020-02-05')
  await page.getByRole('button', { name: '完了', exact: true }).click()
  await page.getByRole('button', { name: '2月4日 トレーニングあり', exact: true }).click()
  await page.getByRole('link', { name: '編集', exact: true }).last().click()
  await expect(page.getByLabel('トレーニング日')).toHaveValue('2020-02-04')
  page.on('dialog', (dialog) => dialog.accept())
  // Sets are deleted by swiping the row left, as on the recording screen.
  const row = (await page.getByRole('button', { name: /100kg 10回を編集/ }).boundingBox())!
  await page.mouse.move(row.x + row.width - 10, row.y + row.height / 2)
  await page.mouse.down()
  for (let step = 1; step <= 10; step++) await page.mouse.move(row.x + row.width - 10 - 30 * step, row.y + row.height / 2)
  await page.mouse.up()
  await expect(page.getByRole('button', { name: /100kg 10回を編集/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'この記録を削除', exact: true }).click()
  await expect(page).toHaveURL(/\/history\?date=2020-02-04$/)
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
  await page.getByRole('link', { name: /続きを記録|本日のトレーニングを追加/ }).click()
  await page.getByRole('button', { name: '肩', exact: true }).click()
  await expect(page.getByRole('region', { name: '肩の種目' }).getByRole('button', { name: 'ケーブルサイドレイズ 自分の種目', exact: true })).toBeVisible()
})

test('routines and catalog order persist; history switches edit targets without cancel', async ({ page }) => {
  test.setTimeout(90_000)
  const data = await mockApi(page)
  await expect(page.getByText('最近使った種目')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '体幹', exact: true })).toHaveCount(0)
  await holdDrag(page, page.getByRole('button', { name: 'チェストプレスを長押しして並び替え', exact: true }), page.getByRole('button', { name: 'ベンチプレスを長押しして並び替え', exact: true }), true)
  await expect(page.getByRole('region', { name: '胸の種目', exact: true }).getByRole('button').first()).toHaveText('ベンチプレス')
  await holdDrag(page, page.getByRole('button', { name: 'チェストプレスを長押しして並び替え', exact: true }), page.getByRole('button', { name: 'ベンチプレスを長押しして並び替え', exact: true }))
  await expect(page.getByRole('region', { name: '胸の種目', exact: true }).getByRole('button').first()).toHaveText('チェストプレス')
  await expect(page.getByRole('button', { name: 'チェストプレスを長押しして並び替え', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('region', { name: '胸の種目', exact: true }).getByRole('button').first()).toHaveText('チェストプレス')
  await page.getByRole('button', { name: '＋ 作る', exact: true }).click()
  await page.getByLabel('ルーティン名').fill('胸の日')
  await page.getByRole('button', { name: '＋ ルーティンに種目を追加', exact: true }).click()
  await page.getByRole('button', { name: 'ベンチプレス', exact: true }).click()
  await page.getByRole('button', { name: '＋ ルーティンに種目を追加', exact: true }).click()
  await page.getByRole('button', { name: 'チェストプレス', exact: true }).click()
  await holdDrag(page, page.getByRole('button', { name: 'チェストプレスを長押しして並び替え', exact: true }), page.getByRole('button', { name: 'ベンチプレスを長押しして並び替え', exact: true }))
  await page.getByRole('button', { name: 'ルーティンを保存', exact: true }).click()
  await expect(page.getByRole('button', { name: '胸の日を開始', exact: true })).toBeVisible()
  expect(data.routines[0].exercise_ids).toEqual(['machine', 'bench'])
  await page.reload()
  await page.getByRole('button', { name: '胸の日を編集', exact: true }).click()
  const routineEditor = page.getByRole('region', { name: 'ルーティン編集', exact: true })
  await expect(page.getByRole('region', { name: '胸の種目', exact: true })).toHaveCount(0)
  await routineEditor.getByRole('button', { name: 'チェストプレスを長押しして並び替え', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => data.routines[0].exercise_ids).toEqual(['bench', 'machine'])
  await holdDrag(page, routineEditor.getByRole('button', { name: 'チェストプレスを長押しして並び替え', exact: true }), routineEditor.getByRole('button', { name: 'ベンチプレスを長押しして並び替え', exact: true }))
  await expect.poll(() => data.routines[0].exercise_ids).toEqual(['machine', 'bench'])
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: '胸の日を開始', exact: true }).click()
  await page.getByRole('spinbutton', { name: '重量', exact: true }).fill('40')
  await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  await expect.poll(() => data.sets.length).toBe(1)
  await page.getByRole('button', { name: /次の種目/ }).click()
  await page.reload()
  await expect(page.getByRole('region', { name: '進行中のルーティン' })).toContainText('2 / 2種目')
  await page.getByRole('spinbutton', { name: '重量', exact: true }).fill('60')
  await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  await expect.poll(() => data.sets.length).toBe(2)
  expect(data.sets.map((s) => s.exercise_id)).toEqual(['machine', 'bench'])
  await page.screenshot({ path: 'test-results/routine-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '終了', exact: true }).click()
  await page.getByRole('button', { name: /トレーニングあり/ }).click()
  await page.getByRole('link', { name: '編集', exact: true }).click()
  await page.getByRole('button', { name: /チェストプレス 40kg.*を編集/ }).click()
  await page.getByLabel('重量（kg）').fill('45')
  await page.getByRole('button', { name: /ベンチプレス 60kg.*を編集/ }).click()
  await page.getByLabel('回数').fill('12')
  await page.getByRole('button', { name: /チェストプレス 40kg.*を編集/ }).click()
  await expect(page.getByLabel('重量（kg）')).toHaveValue('45')
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await page.getByRole('button', { name: /ベンチプレス 60kg.*を編集/ }).click()
  await expect(page.getByLabel('回数')).toHaveValue('12')
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await expect.poll(() => data.sets[1].reps).toBe(12)
  await page.screenshot({ path: 'test-results/history-switch-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Big3 score has one editable goal and the logo returns home', async ({ page }) => {
  const data = await mockApi(page)
  const now = new Date().toISOString()
  data.workouts.push({ id: 'w-score', user_id: USER, performed_at: now, created_at: now })
  for (const [exercise_id, weight_kg] of [['squat', 160], ['bench', 80], ['deadlift', 180]] as const) {
    data.sets.push({ id: 's-' + exercise_id, exercise_id, weight_kg, reps: 5, set_index: 1, workout_id: 'w-score', created_at: now })
  }
  await page.getByRole('link', { name: 'BIG3', exact: true }).click()
  const score = page.getByRole('region', { name: 'Big3スコア' })
  await expect(score.getByText('472.5', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '目標を設定', exact: true }).click()
  await page.getByLabel('目標の合計重量（kg）').fill('600')
  await page.getByLabel('目標期限', { exact: true }).fill('2027-12-31')
  await page.getByRole('button', { name: '目標を保存', exact: true }).click()
  await expect(score).toContainText('127.5 kg')
  await expect(score).toContainText('78%')
  await page.getByRole('button', { name: '目標を変更', exact: true }).click()
  await page.getByLabel('目標の合計重量（kg）').fill('550')
  await page.getByRole('button', { name: '目標を保存', exact: true }).click()
  await expect(score).toContainText('目標 550 kg')
  expect(data.goals).toHaveLength(1)
  await page.reload()
  await expect(score).toContainText('目標 550 kg')
  await expect(score).toContainText('77.5 kg')
  await expect(page.getByText('目標を追加', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/strength-score-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Glog トップへ', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  // Home is BIG3. Today's sets were seeded above, so recording continues today's single workout.
  await page.getByRole('link', { name: /続きを記録.*今日 3セット/ }).click()
  await expect(page.getByRole('heading', { name: '次はどの種目？' })).toBeVisible()
})

test('sets are deleted by swiping left like a mail app', async ({ page }) => {
  const data = await mockApi(page)
  await page.getByRole('button', { name: 'ベンチプレス', exact: true }).click()
  for (const reps of ['8', '6', '4']) {
    await page.getByRole('spinbutton', { name: '回数', exact: true }).fill(reps)
    await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  }
  await expect.poll(() => data.sets.length).toBe(3)
  await expect(page.getByRole('button', { name: '直前のセットを取り消す' })).toHaveCount(0)
  const rows = page.getByRole('listitem')
  const swipe = async (index: number, distance: number) => {
    // 下部の固定タブに隠れているとマウス操作が届かないので、先に一番下までスクロールする
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const box = (await rows.nth(index).boundingBox())!
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width - 10, y)
    await page.mouse.down()
    for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + box.width - 10 - distance * step / 10, y)
    await page.mouse.up()
  }
  // A long swipe deletes the middle set right away.
  const middle = data.sets[1].id
  await swipe(1, 300)
  await expect.poll(() => data.sets.map((s) => s.id)).not.toContain(middle)
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toContainText('2set')
  // A short swipe only reveals the delete button.
  await swipe(0, 100)
  await expect(page.getByText('削除', { exact: true }).first()).toBeInViewport()
  expect(data.sets).toHaveLength(2)
  await page.screenshot({ path: 'test-results/swipe-delete-mobile.png' })
  await page.getByRole('button', { name: /1set .*を削除$/ }).click()
  await expect.poll(() => data.sets.length).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('reopening the app mid-workout goes straight to recording; otherwise it opens on the home dashboard', async ({ page }) => {
  const data = await mockApi(page)
  await page.getByRole('button', { name: 'ベンチプレス', exact: true }).click()
  await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  await expect.poll(() => data.sets.length).toBe(1)
  // A server-side mock mutation can precede the client's saved acknowledgement.
  // Await the enabled memo action and absence of retry before reloading the draft.
  await expect(page.getByRole('button', { name: /1set .*のメモを追加/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: '未保存・再試行', exact: true })).toHaveCount(0)
  await page.goto('/')
  await expect(page).toHaveURL(/\/log$/)
  await expect(page.getByRole('button', { name: 'セット完了', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'ホーム', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('region', { name: '今月のトレーニング' }).getByRole('button', { name: /トレーニングあり/ })).toHaveCount(1)
  await expect(page.getByRole('region', { name: '今日のトレーニング' })).toContainText('ベンチプレス')
  await page.getByRole('link', { name: /続きを記録/ }).click()
  await page.getByRole('button', { name: '終了', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('region', { name: '今月のトレーニング' })).toBeVisible()
  await page.screenshot({ path: 'test-results/home-dashboard-mobile.png', fullPage: true })
  // BIG3 lives on its own tab and no longer carries a record button.
  await page.getByRole('link', { name: 'BIG3', exact: true }).click()
  await expect(page).toHaveURL(/\/big3$/)
  await expect(page.getByRole('region', { name: 'Big3スコア' })).toBeVisible()
  await expect(page.getByRole('link', { name: /本日のトレーニングを追加|続きを記録/ })).toHaveCount(0)
  // The editor groups the day's sets under each exercise.
  await page.goto('/history/' + data.workouts[0].id)
  await expect(page.getByRole('heading', { name: 'ベンチプレス', exact: true })).toHaveCount(1)
})

test('chin-ups ask for bodyweight once and record assisted sets against the total load', async ({ page }) => {
  const data = await mockApi(page)
  await page.getByRole('button', { name: '背中', exact: true }).click().catch(() => {})
  await page.getByRole('button', { name: 'チンニング', exact: true }).click()
  await page.getByLabel('体重（kg）').fill('70')
  await page.getByRole('button', { name: '体重を保存', exact: true }).click()
  await expect.poll(() => data.bodyweights.length).toBe(1)
  await page.getByRole('spinbutton', { name: '加重', exact: true }).fill('-20')
  await expect(page.getByText(/総重量/)).toContainText('総重量 50 kg')
  await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  await expect.poll(() => data.sets[0]?.weight_kg).toBe(-20)
  await expect(page.getByRole('listitem').first()).toContainText('−20 kg')
  await page.screenshot({ path: 'test-results/chinning-mobile.png' })
})

test('history calendar changes month by swiping left and right', async ({ page }) => {
  await mockApi(page)
  await page.getByRole('link', { name: '履歴', exact: true }).click()
  const now = new Date()
  const label = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月`
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  await expect(page.getByText(label(now), { exact: true })).toBeVisible()
  const calendar = page.getByLabel(/スワイプで月を切り替え/)
  const swipe = async (dx: number) => {
    // Wait for the previous slide animation to finish so the swipe starts on the calendar.
    await expect.poll(() => calendar.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
    const box = (await calendar.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let step = 1; step <= 10; step++) await page.mouse.move(x + dx * step / 10, y)
    await page.mouse.up()
  }
  await swipe(150)
  await expect(page.getByText(label(previous), { exact: true })).toBeVisible()
  await swipe(-150)
  await expect(page.getByText(label(now), { exact: true })).toBeVisible()
  await swipe(-150)
  await expect(page.getByText(label(now), { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('memo field is iOS-zoom safe and grows so long text stays visible', async ({ page }) => {
  const data = await mockApi(page)
  await page.getByRole('button', { name: 'ベンチプレス', exact: true }).click()
  const memo = page.getByPlaceholder(/メモ（任意）/)

  // iOS zooms the page when a focused field is under 16px.
  const fontSize = await memo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(fontSize).toBeGreaterThanOrEqual(16)

  const oneLine = (await memo.boundingBox())!.height
  await memo.fill('フォームを意識する。\n肩甲骨を寄せたまま下ろし、最後の1回だけ補助をもらった。')
  const grown = (await memo.boundingBox())!.height
  expect(grown).toBeGreaterThan(oneLine)
  // Every line is visible: nothing is scrolled out of view.
  expect(await memo.evaluate((el: HTMLTextAreaElement) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: 'セット完了', exact: true }).click()
  await expect.poll(() => data.sets[0]?.note).toContain('肩甲骨')
  // The saved memo keeps its line break on screen.
  await expect(page.getByText('肩甲骨を寄せたまま下ろし', { exact: false })).toBeVisible()
  // The field is clear and back to one line for the next set.
  await expect(memo).toHaveValue('')
  expect((await memo.boundingBox())!.height).toBe(oneLine)
})

test('the record tab is gone and reps are filled from records, then from an estimate', async ({ page }) => {
  const data = await mockApi(page)

  // 過去に 80kg×5 と 80kg×8、直近に 60kg×12 を挙げている
  const past = new Date(Date.now() - 7 * 86400000).toISOString()
  data.workouts.push({ id: 'w-past', user_id: USER, performed_at: past, created_at: past })
  ;([[80, 5], [80, 8], [60, 12]] as const).forEach(([weight_kg, reps], i) =>
    data.sets.push({ id: 'p' + i, workout_id: 'w-past', exercise_id: 'bench', weight_kg, reps, set_index: i + 1, created_at: new Date(Date.parse(past) + i * 1000).toISOString() }))

  await page.goto('/')
  // 記録タブは廃止。ホームのボタンと履歴から入る。
  const tabs = page.getByRole('navigation', { name: 'メイン' })
  await expect(tabs.getByRole('link', { name: '記録', exact: true })).toHaveCount(0)
  await expect(tabs.getByRole('link')).toHaveCount(5)

  await page.getByRole('link', { name: /本日のトレーニングを追加|続きを記録/ }).click()
  await page.getByRole('button', { name: 'ベンチプレス', exact: true }).click()

  const weight = page.getByRole('spinbutton', { name: '重量', exact: true })
  const reps = page.getByRole('spinbutton', { name: '回数', exact: true })
  // 直近が 60kg×12 なので、その重量の自己ベストである12回が入る
  await expect(weight).toHaveValue('60')
  await expect(reps).toHaveValue('12')

  // 80kg にすると、その重量の自己ベストである8回に切り替わる
  await weight.fill('80')
  await expect(reps).toHaveValue('8')
  await expect(page.getByText('この重量の自己ベスト')).toContainText('8')

  // 挙げたことのない重量は、推定1RM（80kg×8 から約99.3kg）から逆算する
  await weight.fill('85')
  await expect(reps).toHaveValue('6')
  await expect(page.getByText("この重量の目安")).toContainText("これまでの記録から")
  // 推定1RMを超える重量は1回
  await weight.fill('100')
  await expect(reps).toHaveValue('1')
})

test('exports the chosen period as markdown, memos included', async ({ page }) => {
  const data = await mockApi(page)
  const now = new Date()
  const at = (d: number) => new Date(now.getFullYear(), now.getMonth(), d, 12).toISOString()
  data.workouts.push({ id: 'w-x', user_id: USER, performed_at: at(now.getDate()), created_at: at(now.getDate()) })
  data.sets.push({ id: 'x1', workout_id: 'w-x', exercise_id: 'bench', weight_kg: 80, reps: 5, set_index: 1, note: '肩甲骨を寄せる', created_at: at(now.getDate()) })

  await page.goto('/export')
  await page.getByRole('button', { name: '今月', exact: true }).click()
  await page.getByRole('button', { name: 'Markdownを作成', exact: true }).click()

  const output = page.getByRole('textbox', { name: 'エクスポートした内容' })
  await expect(output).toContainText('# Glog トレーニング記録')
  await expect(output).toContainText('トレーニング日数: 1日 / 総セット数: 1')
  // 80kg×5 の推定1RM は 90.0kg
  await expect(output).toContainText('| 1 | 80.0 kg | 5 | 90.0 kg | 肩甲骨を寄せる |')
  await expect(page.getByRole('button', { name: 'ファイルで保存' })).toBeVisible()
})


test('body composition roundtrip plots both metrics on one chart, edits and deletes past dates from the chart', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const data = await mockApi(page)
  const date = (daysAgo: number) => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const short = (day: string) => day.slice(5).replace('-', '/')
  const today = date(0), past = date(3), older = date(45), oldest = date(180)
  data.bodyweights.push(
    { recorded_on: oldest, bodyweight_kg: 66, body_fat_pct: 18 },
    { recorded_on: older, bodyweight_kg: 68, body_fat_pct: 17 },
    { recorded_on: past, bodyweight_kg: 70, body_fat_pct: 16 },
  )
  await page.goto('/profile')
  await expect(page.getByLabel('体重（kg）')).toHaveCount(0)
  await page.getByRole('link', { name: '体組成を記録する →' }).click()
  await expect(page.getByLabel('体重（kg）')).toHaveValue('70')
  await expect(page.getByLabel('体脂肪率（%）')).toHaveValue('16')
  const trend = page.getByRole('region', { name: '推移' })
  const form = page.getByRole('region', { name: '記録の入力' })
  const weightDots = trend.locator('.recharts-line-dots circle[fill="#E8412F"]')
  const fatDots = trend.locator('.recharts-line-dots circle[fill="#3B82F6"]')
  const weightAverage = trend.locator('path.recharts-line-curve[stroke="#E8412F"]')
  const fatAverage = trend.locator('path.recharts-line-curve[stroke="#3B82F6"]')
  const tooltip = trend.locator('.recharts-tooltip-wrapper')
  // Viewport intersection alone can leave a point behind the fixed mobile nav.
  const pointCenter = async (index: number) => {
    const dot = weightDots.nth(index)
    await dot.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await expect.poll(() => dot.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return Boolean(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        ?.closest('.recharts-wrapper'))
    })).toBe(true)
    const box = (await dot.boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const inspectPoint = async (index: number, ...texts: string[]) => {
    const { x, y } = await pointCenter(index)
    await page.mouse.move(x, y)
    for (const text of texts) await expect(tooltip).toContainText(text)
  }
  const tapPoint = async (index: number) => {
    const { x, y } = await pointCenter(index)
    await page.mouse.click(x, y)
  }
  await expect(page.getByRole('region', { name: '最近の記録' })).toHaveCount(0)
  await expect(trend.getByRole('button', { name: '体脂肪率', exact: true })).toHaveCount(0)
  await expect(trend.getByRole('region', { name: '最新の記録' })).toContainText('体重・左の目盛り')
  await expect(trend.getByRole('region', { name: '最新の記録' })).toContainText('体脂肪率・右の目盛り')
  await page.getByLabel('体重（kg）').fill('70.2')
  await page.getByLabel('体脂肪率（%）').fill('15.4')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await expect.poll(() => data.bodyweights.find((b) => b.recorded_on === today)).toMatchObject({ bodyweight_kg: 70.2, body_fat_pct: 15.4 })
  await expect(page.getByRole('status')).toHaveText('記録しました')
  await page.reload()
  await expect(page.getByLabel('体重（kg）')).toBeEnabled()
  const latest = page.getByRole('region', { name: '最新の記録' })
  await expect(latest.getByLabel('体重 70.2kg、前回比 +0.2kg')).toBeVisible()
  await expect(latest.getByLabel('体脂肪率 15.4%、前回比 -0.6%')).toBeVisible()
  await expect(weightDots).toHaveCount(2)
  await expect(fatDots).toHaveCount(2)
  await expect(weightAverage).toHaveCount(1)
  await expect(fatAverage).toHaveCount(1)
  // Hovering a day shows both metrics and both averages through Recharts' tooltip.
  await inspectPoint(1, '70.2 kg', '70.1 kg', '15.4 %', '15.7 %')
  // Both Y axes must keep their labels inside the SVG on the 390px mobile viewport.
  const axisLabelsFit = () => trend.locator('svg.recharts-surface').evaluate((svg) => {
    const bounds = svg.getBoundingClientRect()
    const labels = [...svg.querySelectorAll('.recharts-yAxis-tick-labels text')]
    return labels.length > 0 && labels.every((label) => {
      const box = label.getBoundingClientRect()
      return box.left >= bounds.left && box.right <= bounds.right
    })
  })
  await expect.poll(axisLabelsFit).toBe(true)
  await page.screenshot({ path: 'test-results/body-composition-mobile.png', fullPage: true })

  await page.getByLabel('体脂肪率（%）').fill('')
  await page.getByLabel('体重（kg）').fill('70.8')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await expect.poll(() => data.bodyweights.find((b) => b.recorded_on === today)).toMatchObject({ bodyweight_kg: 70.8, body_fat_pct: null })
  expect(data.bodyweights).toHaveLength(4)
  await expect(fatDots).toHaveCount(1)
  await expect(latest.getByLabel('体脂肪率 未記録')).toBeVisible()
  await inspectPoint(1, '70.8 kg')
  // Tapping a day on the chart opens it in the form.
  await tapPoint(0)
  await expect(form).toContainText(`${short(past)}の記録`)
  await expect(page.getByLabel('体重（kg）')).toHaveValue('70')
  await page.getByLabel('体重（kg）').fill('71')
  await page.getByRole('button', { name: '記録する', exact: true }).click()
  await expect.poll(() => data.bodyweights.find((b) => b.recorded_on === past)).toMatchObject({ bodyweight_kg: 71, body_fat_pct: 16 })
  await expect(form).toContainText('今日の記録')
  await expect(page.getByLabel('体重（kg）')).toHaveValue('70.8')
  await inspectPoint(0, '71 kg', '16 %')
  await page.getByRole('button', { name: '3ヶ月', exact: true }).click()
  await expect(weightDots).toHaveCount(3)
  await page.getByRole('button', { name: '1年', exact: true }).click()
  await expect(weightDots).toHaveCount(4)
  await page.getByRole('button', { name: '1ヶ月', exact: true }).click()
  await expect(weightDots).toHaveCount(2)
  // Deleting asks once more before removing the day.
  await tapPoint(0)
  await expect(form).toContainText(`${short(past)}の記録`)
  await form.getByRole('button', { name: `${past} の記録を削除` }).click()
  expect(data.bodyweights.some((b) => b.recorded_on === past)).toBe(true)
  await form.getByRole('button', { name: '削除する', exact: true }).click()
  await expect.poll(() => data.bodyweights.some((b) => b.recorded_on === past)).toBe(false)
  await expect(weightDots).toHaveCount(1)
  await expect(form).toContainText('今日の記録')
  await inspectPoint(0, '70.8 kg')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
