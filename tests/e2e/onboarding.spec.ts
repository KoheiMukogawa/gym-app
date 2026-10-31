import { expect, test, type Locator } from '@playwright/test'
test('public introduction and signup save name and icon in registration metadata',async({page})=>{
 let registration: Record<string,unknown>|null=null
 await page.route('https://example.supabase.co/**',async route=>{
  const url=new URL(route.request().url()),method=route.request().method()
  if(method==='OPTIONS')return route.fulfill({status:204})
  if(url.pathname.endsWith('/signup')){registration=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify({user:{id:'new-user',email:'new@example.com'},session:null})})}
  return route.fulfill({contentType:'application/json',body:JSON.stringify([])})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:/必要十分な機能を、\s*直感的な操作で。/})).toBeVisible()
 await page.getByRole('link',{name:'無料で始める'}).first().click()
 await page.getByLabel('名前',{exact:true}).fill('新人')
 await page.getByRole('button',{name:'バーベル',exact:true}).click()
 await page.getByLabel('全体ランキングに参加する').check()
 await page.getByLabel('メールアドレス').fill('new@example.com')
 await page.getByLabel('パスワード').fill('strong-password-123')
 await page.getByRole('button',{name:'アカウントを作成',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('確認メール')
 expect(registration).toMatchObject({data:{display_name:'新人',profile_icon:'barbell',global_ranking:true}})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('landing showcases graphs, AI export and personal rankings on phones and desktop', async ({ page }) => {
  const errors: string[] = []
  const mutations: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('https://example.supabase.co/**', route => {
    const method = route.request().method()
    if (!['GET', 'OPTIONS'].includes(method)) mutations.push(method)
    return method === 'OPTIONS' ? route.fulfill({ status: 204 }) : route.fulfill({ contentType: 'application/json', body: '[]' })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /必要十分な機能を、\s*直感的な操作で。/ })).toBeVisible()
  // The phone runs the real app on sample data (/demo in an iframe), so it always matches the app.
  const app = page.frameLocator('iframe[title="Glogのアプリの画面（見本）"]')
  const tabs = app.getByRole('navigation', { name: 'メイン' })
  // The phone is scaled with a CSS transform, which Playwright's pointer clicks inside an iframe
  // do not follow; a DOM click is what a tap does here.
  const tap = (target: Locator) => target.evaluate((element: HTMLElement) => element.click())
  for (const width of [320, 375, 390, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    // The phone opens on home: a bench press day of the member's real record, and the BIG3 total.
    await expect(page.getByRole('navigation', { name: '紹介の進み具合' })).not.toHaveAttribute('data-visible')
    await expect(app.getByRole('heading', { name: '2026年10月' })).toBeVisible()
    await expect(app.getByText('ベンチプレス', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect(app.getByRole('link', { name: 'BIG3の詳細へ' })).toContainText('478')
    // The phone's resting size (the first screen draws it larger, then it shrinks into place while scrolling).
    const height = await page.locator('.landing-phone').evaluate((element: HTMLElement) => element.offsetHeight)
    // Pinned beside the text on wide screens; on phones it takes the top part of the screen.
    expect(height).toBeGreaterThan(width < 768 ? 400 : 540)
    expect(height).toBeLessThanOrEqual(width === 1280 ? 760 : 844)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'test-results/landing-hero-' + width + '.png', animations: 'disabled' })
    // The app's own links work inside the phone and never leave the landing page.
    await tap(app.getByRole('link', { name: 'BIG3の詳細へ' }))
    await expect(page).toHaveURL(/\/$/)
    await expect(app.getByLabel('Big3スコア')).toContainText('目標まであと')
    await expect(app.getByRole('heading', { name: 'デッドリフト' })).toBeVisible()
    await tap(tabs.getByRole('link', { name: '履歴', exact: true }))
    await expect(app.getByRole('heading', { name: 'トレーニング履歴' })).toBeVisible()
    await expect(app.getByText('2026年10月')).toBeVisible()
    await tap(tabs.getByRole('link', { name: 'ランキング', exact: true }))
    await expect(app.getByText('いつものジム仲間')).toBeVisible()
    await expect(app.getByText('478 kg')).toBeVisible()
    await tap(tabs.getByRole('link', { name: '体組成', exact: true }))
    await expect(app.locator('.recharts-line-curve').first()).toBeVisible()
    // Scrolling the tour switches the pinned phone to each chapter's screen.
    for (const [chapter, heading] of [['ranking', 'ランキング'], ['export', 'データをエクスポート']] as const) {
      await page.locator(`[data-chapter="${chapter}"]`).evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - innerHeight * (innerWidth < 768 ? 0.6 : 0.3)))
      await expect(page.locator(`[data-chapter="${chapter}"]`)).toHaveAttribute('data-active', 'true')
      await expect(app.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await expect(page.locator('.landing-phone')).toBeInViewport()
      // The progress bar tells how far along the tour is.
      await expect(page.getByRole('navigation', { name: '紹介の進み具合' }).locator('[aria-current="step"]')).toHaveAccessibleName(new RegExp(`${chapter === 'ranking' ? 3 : 6} / 7`))
    }
    await page.locator('[data-chapter="list"]').evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - innerHeight * (innerWidth < 768 ? 0.6 : 0.3)))
    // The list chapter switches the recording screen to typed rows.
    await expect(app.getByText(/前回の記録/).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  // People switching from another app: an honest note about past records.
  const moving = page.locator('details').filter({ has: page.locator('summary', { hasText: '今使っているアプリの記録は移せますか？' }) })
  await moving.locator('summary').click()
  await expect(moving).toContainText('自動で取り込む機能はありません')
  const faq = page.locator('details').filter({ has: page.locator('summary', { hasText: '料金はかかりますか？' }) })
  await expect(faq).not.toHaveAttribute('open')
  await faq.locator('summary').click()
  await expect(faq).toHaveAttribute('open')
  await expect(faq).toContainText('かかりません')
  await page.getByRole('link', { name: '無料で始める', exact: true }).last().click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByRole('heading', { name: 'プロフィールを作って始める' })).toBeVisible()
  await page.goto('/')
  await page.getByRole('link', { name: 'アカウントをお持ちの方はログイン' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(mutations).toEqual([])
  expect(errors).toEqual([])
})
