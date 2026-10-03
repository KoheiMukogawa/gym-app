import { expect, test } from '@playwright/test'

// Fixed synthetic history and 300ms/API response latency make the old and new
// launch paths comparable. This is not a measurement of the production network.
test('mobile startup avoids recording queries and preserves input on first visit', async ({ page }, testInfo) => {
  const baseline = process.env.STARTUP_BASELINE === '1'
  const uid = '11111111-1111-4111-8111-111111111111'
  const date = new Date().toISOString()
  const exercises = [
    { id: 'squat', name: 'スクワット', name_normalized: 'スクワット', muscle_group: 'legs', is_preset: true },
    { id: 'bench', name: 'ベンチプレス', name_normalized: 'ベンチプレス', muscle_group: 'chest', is_preset: true },
    { id: 'deadlift', name: 'デッドリフト', name_normalized: 'デッドリフト', muscle_group: 'back', is_preset: true },
  ]
  const sets = [
    { exercise_id: 'squat', weight_kg: 160, reps: 5, performed_at: date },
    { exercise_id: 'bench', weight_kg: 80, reps: 1, performed_at: date },
    ...Array.from({ length: 1001 }, (_, i) => ({ exercise_id: 'deadlift', weight_kg: i === 1000 ? 220 : 100, reps: 1, performed_at: date })),
  ]
  const session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: date } }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  const requests: { endpoint: string; at: number }[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.split('/').at(-1)!
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    requests.push({ endpoint, at: Date.now() })
    await new Promise(resolve => setTimeout(resolve, 300))
    const reply = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (endpoint === 'user') return reply(session.user)
    if (endpoint === 'profiles') return reply({ id: uid, display_name: '起動テスト' })
    if (endpoint === 'my_big3_data') return reply({ exercises, mappings: [], sets })
    if (endpoint === 'exercises') return reply(exercises)
    if (endpoint === 'workout_sets') {
      const start = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000)
      return reply(sets.slice(start, start + limit).map(s => ({ ...s, workouts: { performed_at: s.performed_at } })))
    }
    if (endpoint === 'workouts') return reply(req.headers().accept?.includes('object') ? null : [])
    return reply([])
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: '今月のトレーニング' })).toBeVisible()
  const homeAt = Date.now()
  await expect(page.getByRole('region', { name: 'BIG3', exact: true })).toContainText('480')
  const big3At = Date.now()
  await page.waitForLoadState('networkidle')
  const counts = Object.fromEntries([...new Set(requests.map(r => r.endpoint))].map(endpoint => [endpoint, requests.filter(r => r.endpoint === endpoint).length]))
  const first = requests[0].at
  const measurement = { baseline, simulatedApiLatencyMs: 300, historySets: sets.length,
    homeMs: homeAt - first, big3Ms: big3At - first, homeToBig3Ms: big3At - homeAt, counts }
  console.log('STARTUP ' + JSON.stringify(measurement))
  await testInfo.attach('startup-measurement', { body: JSON.stringify(measurement, null, 2), contentType: 'application/json' })
  if (baseline) {
    expect(counts.workout_sets).toBe(3) // 2 BIG3 pages plus recording suggestions.
    expect(counts.exercises).toBe(2)
  } else {
    expect(counts.my_big3_data).toBe(1)
    for (const endpoint of ['workout_sets', 'exercises', 'big3_exercise_mappings', 'training_routines', 'exercise_preferences']) expect(counts[endpoint] ?? 0).toBe(0)
    expect(counts.bodyweight_logs).toBe(1)
  }
  await page.screenshot({ path: `test-results/startup-${baseline ? 'before' : 'after'}.png`, fullPage: true })
  await page.getByRole('link', { name: /記録する/ }).click()
  await page.getByRole('button', { name: 'ベンチプレス', exact: true }).click()
  await page.getByRole('spinbutton', { name: '重量', exact: true }).fill('97.5')
  await page.getByRole('link', { name: 'ホーム', exact: true }).click()
  await page.getByRole('link', { name: /記録する/ }).click()
  await expect(page.getByRole('spinbutton', { name: '重量', exact: true })).toHaveValue('97.5')
  expect(errors).toEqual([])
})
