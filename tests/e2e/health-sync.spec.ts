import { expect, test, type Page } from '@playwright/test'

const USER='11111111-1111-4111-8111-111111111111'
type Row={recorded_on:string;bodyweight_kg:number;body_fat_pct:number|null}
type HealthRecord={date:string;weight_kg:number;body_fat_pct?:number|null}
async function setup(page:Page) {
  const rows:Row[]=[]
  const state={enabled:false,issued_at:null as string|null,last_synced_at:null as string|null,last_synced_count:null as number|null}
  const controls={statusErrors:0,issueErrors:0}
  let token:string|null=null, generations=0
  const offsets:number[]=[]
  const session={access_token:'mock-access-token',refresh_token:'mock-refresh-token',token_type:'bearer',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user:{id:USER,aud:'authenticated',role:'authenticated',email:'test@example.com',
      app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}}
  await page.route('https://example.supabase.co/**',async (route) => {
    const req=route.request(), url=new URL(req.url()), table=url.pathname.split('/').at(-1), method=req.method()
    const reply=(value:unknown,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)})
    if(method==='OPTIONS') return route.fulfill({status:204})
    if(table==='token') return reply(session)
    if(table==='user') return reply(session.user)
    if(table==='logout') return reply({})
    if(table==='profiles') return reply({id:USER,display_name:'テストユーザー'})
    if(table==='health_sync_status') {
      if(controls.statusErrors-- >0) return reply({message:'status unavailable'},500)
      return reply(state)
    }
    if(table==='health_sync_issue_token') {
      if(controls.issueErrors-- >0) return reply({message:'issue unavailable'},500)
      token=(++generations %2 ? 'a':'b').repeat(64)
      state.enabled=true;state.issued_at=new Date().toISOString()
      return reply({token,issued_at:state.issued_at})
    }
    if(table==='health_sync_revoke_token') {token=null;state.enabled=false;return route.fulfill({status:204})}
    if(table==='bodyweight_logs') {
      const start=Number(url.searchParams.get('offset') ?? 0),limit=Number(url.searchParams.get('limit') ?? 1000)
      expect(url.searchParams.get('user_id')).toBe('eq.'+USER)
      expect(url.searchParams.get('order')).toBe('recorded_on.asc')
      offsets.push(start)
      return reply([...rows].sort((a,b)=>a.recorded_on.localeCompare(b.recorded_on)).slice(start,start+limit))
    }
    if(table==='body-metrics') {
      if(!token || req.headers().authorization !== 'Bearer '+token) return reply({error:'Unauthorized'},401)
      const body=req.postDataJSON() as {records:HealthRecord[];mode?:'keep'|'overwrite'}
      const counts={inserted:0,updated:0,skipped:0}
      for(const record of body.records) {
        const existing=rows.find((r)=>r.recorded_on===record.date)
        if(!existing) { rows.push({recorded_on:record.date,bodyweight_kg:record.weight_kg,body_fat_pct:record.body_fat_pct ?? null});counts.inserted++ }
        else if(body.mode==='overwrite') {existing.bodyweight_kg=record.weight_kg;existing.body_fat_pct=record.body_fat_pct ?? existing.body_fat_pct;counts.updated++}
        else counts.skipped++
      }
      state.last_synced_at=new Date().toISOString();state.last_synced_count=counts.inserted+counts.updated
      return reply(counts)
    }
    return reply([])
  })
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button',{name:'ログイン',exact:true}).click()
  await expect(page.getByRole('region',{name:'今月のトレーニング'})).toBeVisible()
  await page.goto('/body')
  await expect(page.getByRole('button',{name:'記録を再読み込み'})).toBeEnabled()
  const sync=(credential:string,records:HealthRecord[],mode?:'keep'|'overwrite') => page.evaluate(async ({credential,records,mode}) => {
    const response=await fetch('https://example.supabase.co/functions/v1/body-metrics',{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential},body:JSON.stringify({records,...(mode?{mode}:{})})})
    return {status:response.status,body:await response.json()}
  },{credential,records,mode})
  return {rows,state,controls,offsets,sync}
}

test('Health connection, historical sync, keep/overwrite and revoke use real mobile charts',async ({page}) => {
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message))
  const data=await setup(page)
  await page.getByRole('button',{name:'ヘルスケア連携',exact:true}).click()
  await expect(page.getByText('未接続',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'連携キーを発行',exact:true}).click()
  const credential=await page.getByLabel('新しい連携キー').inputValue()
  expect(credential).toHaveLength(64)
  await expect(page.getByText('初回同期待ち',{exact:true})).toBeVisible()
  await page.getByText('iPhoneショートカットの設定手順',{exact:true}).click()
  await expect(page.getByTestId('health-sync-guide')).toContainText('yyyy-MM-dd')
  await expect(page.getByTestId('health-sync-guide')).toContainText('256KiB')
  await page.getByText('iPhoneショートカットの設定手順',{exact:true}).click()

  const records=[{date:'2015-01-02',weight_kg:60,body_fat_pct:14},{date:'2015-01-03',weight_kg:62}]
  expect(await data.sync(credential,records)).toEqual({status:200,body:{inserted:2,updated:0,skipped:0}})
  await page.getByRole('button',{name:'同期結果を確認',exact:true}).click()
  await expect(page.getByRole('button',{name:'体重を記録',exact:true})).toBeEnabled()
  await expect(page.getByText(/書き込み 2件/)).toBeVisible()
  await expect(page.getByText('連携中',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'全期間',exact:true}).click()
  const trend=page.getByRole('region',{name:'推移'})
  const dots=trend.locator('.recharts-line-dots circle[fill="#E8412F"]'),fatDots=trend.locator('.recharts-line-dots circle[fill="#3B82F6"]')
  const curves=trend.locator('path.recharts-line-curve[stroke="#E8412F"]'),tooltip=trend.locator('.recharts-tooltip-wrapper')
  await expect(dots).toHaveCount(2);await expect(fatDots).toHaveCount(1);await expect(curves).toHaveCount(1)
  await expect(trend.locator('.recharts-xAxis-tick-labels')).toContainText('2015/')
  const inspect=async (index:number,...texts:string[]) => {
    const dot=dots.nth(index);await dot.scrollIntoViewIfNeeded();const box=(await dot.boundingBox())!
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
    for(const text of texts) await expect(tooltip).toContainText(text)
  }
  await inspect(0,'60 kg','14 %')
  await inspect(1,'62 kg','61 kg')
  expect(await data.sync(credential,[{date:'2015-01-02',weight_kg:99}], 'keep')).toEqual({status:200,body:{inserted:0,updated:0,skipped:1}})
  await page.getByRole('button',{name:'記録を再読み込み',exact:true}).click()
  await expect(page.getByRole('button',{name:'記録を再読み込み',exact:true})).toBeEnabled()
  await expect(page.getByText(/書き込み 0件/)).toBeVisible()
  await inspect(0,'60 kg','14 %')
  expect(await data.sync(credential,[{date:'2015-01-02',weight_kg:64}], 'overwrite')).toEqual({status:200,body:{inserted:0,updated:1,skipped:0}})
  await page.getByRole('button',{name:'記録を再読み込み',exact:true}).click()
  await expect(page.getByRole('button',{name:'体重を記録',exact:true})).toBeEnabled()
  await inspect(0,'64 kg','14 %')
  await inspect(1,'62 kg','63 kg')
  await expect(page.getByText(/書き込み 1件/)).toBeVisible()

  // This artifact contains only synthetic mock records and a mock token.
  await page.getByRole('region',{name:'ヘルスケア連携設定'}).scrollIntoViewIfNeeded()
  await page.screenshot({path:'test-results/health-setup-mobile.png',fullPage:true})
  await page.getByText('連携キーの管理',{exact:true}).click()
  await page.getByRole('button',{name:'連携キーを再発行',exact:true}).click()
  await expect(page.getByRole('alertdialog')).toContainText('以前の連携キー')
  await page.getByRole('button',{name:'再発行する',exact:true}).click()
  const next=await page.getByLabel('新しい連携キー').inputValue()
  expect(next).not.toBe(credential)
  expect((await data.sync(credential,records)).status).toBe(401)
  await page.getByRole('button',{name:'連携を失効',exact:true}).click()
  await expect(page.getByRole('alertdialog')).toContainText('記録は残ります')
  await page.getByRole('button',{name:'失効する',exact:true}).click()
  await expect(page.getByText('未接続',{exact:true})).toBeVisible()
  await expect(page.getByLabel('新しい連携キー')).toHaveCount(0)
  expect((await data.sync(next,records)).status).toBe(401)
  expect(data.rows).toHaveLength(2)
  await page.goto('/profile');await page.goto('/body')
  await page.getByRole('button',{name:'ヘルスケア連携',exact:true}).click()
  await expect(page.getByText('未接続',{exact:true})).toBeVisible()
  await expect(page.getByLabel('新しい連携キー')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('Health errors retry and manual copy preserve one-time credentials across reload only',async ({page}) => {
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message))
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}}}))
  const data=await setup(page)
  data.controls.statusErrors=1
  await page.getByRole('button',{name:'ヘルスケア連携',exact:true}).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('未接続',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'接続状態を再試行',exact:true}).click()
  await expect(page.getByText('未接続',{exact:true})).toBeVisible()
  data.controls.issueErrors=1
  await page.getByRole('button',{name:'連携キーを発行',exact:true}).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button',{name:'操作を再試行',exact:true}).click()
  await expect(page.getByLabel('新しい連携キー')).toHaveValue('a'.repeat(64))
  await page.getByRole('button',{name:'連携キーをコピー',exact:true}).click()
  await expect(page.getByText(/長押しして/)).toBeVisible()
  const text=page.getByLabel('新しい連携キー');await text.focus()
  expect(await text.evaluate((el:HTMLTextAreaElement)=>el.selectionEnd-el.selectionStart)).toBe(64)
  expect(await text.evaluate((el)=>getComputedStyle(el).fontSize)).toBe('16px')
  await page.getByRole('button',{name:'手動設定の手順を見る'}).click()
  await page.getByRole('button',{name:'送信先URLをコピー',exact:true}).click()
  await expect(page.getByLabel('送信先URL')).toHaveValue('https://example.supabase.co/functions/v1/body-metrics')
  await page.getByRole('button',{name:'記録を再読み込み',exact:true}).click()
  await expect(page.getByRole('button',{name:'記録を再読み込み',exact:true})).toBeEnabled()
  await expect(text).toHaveValue('a'.repeat(64))
  await page.getByText('iPhoneショートカットの設定手順',{exact:true}).click()
  await page.reload();await page.getByRole('button',{name:'ヘルスケア連携',exact:true}).click()
  await expect(page.getByText('初回同期待ち',{exact:true})).toBeVisible()
  await expect(page.getByLabel('新しい連携キー')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('Health history reads more than 1000 rows and charts the earliest year',async ({page}) => {
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message))
  const data=await setup(page)
  data.rows.push(...Array.from({length:1001},(_,i)=>{
    const day=new Date('2010-01-01T12:00:00');day.setDate(day.getDate()+i)
    return {recorded_on:day.toLocaleDateString('sv-SE'),bodyweight_kg:70,body_fat_pct:null}
  }))
  data.offsets.length=0
  await page.getByRole('button',{name:'記録を再読み込み',exact:true}).click()
  await expect(page.getByRole('button',{name:'記録を再読み込み',exact:true})).toBeEnabled()
  await expect.poll(() => data.offsets).toEqual([0,1000])
  await page.getByRole('button',{name:'全期間',exact:true}).click()
  const trend=page.getByRole('region',{name:'推移'})
  const dots=trend.locator('.recharts-line-dots circle[fill="#E8412F"]')
  await expect(dots).toHaveCount(1001)
  await expect(trend.locator('.recharts-xAxis-tick-labels')).toContainText('2010/')
  // The earliest day stays reachable: a tap on its dot opens it in the form.
  const first=dots.first();await first.scrollIntoViewIfNeeded();const box=(await first.boundingBox())!
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
  await expect(page.getByRole('dialog')).toContainText('01/01の記録')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(errors).toEqual([])
})


test('Body overview prioritizes measurements and trend on a narrow phone', async ({page}) => {
  await page.setViewportSize({width:375,height:812})
  const data = await setup(page)
  const today = new Date().toLocaleDateString('sv-SE')
  const yesterday = new Date(today + 'T12:00:00'); yesterday.setDate(yesterday.getDate()-1)
  data.rows.push(
    {recorded_on:yesterday.toLocaleDateString('sv-SE'),bodyweight_kg:70.1,body_fat_pct:16},
    {recorded_on:today,bodyweight_kg:70.3,body_fat_pct:null},
  )
  await page.getByRole('button',{name:'記録を再読み込み'}).click()
  const overview = page.getByRole('region',{name:'最新の記録'})
  await expect(overview).toContainText('70.3')
  await expect(overview).toContainText('前回比 +0.2')
  await expect(overview.getByRole('group', {name:'体脂肪率 未記録'})).toContainText('—')
  const trend = page.getByRole('region',{name:'推移'})
  await expect(trend.locator('path.recharts-line-curve[stroke="#E8412F"]')).toHaveCount(1)
  const refresh = page.getByRole('button',{name:'記録を再読み込み'})
  expect(await refresh.innerText()).toBe('')
  const overviewBox = (await overview.boundingBox())!
  const trendBox = (await trend.boundingBox())!
  await expect(page.getByLabel('体重（kg）')).toHaveCount(0)
  const connectionBox = (await page.getByRole('region',{name:'ヘルスケア連携設定'}).boundingBox())!
  // The latest values are the chart's legend: inside the trend section, above the plot.
  const plotBox = (await trend.locator('svg.recharts-surface').boundingBox())!
  expect(overviewBox.y).toBeGreaterThanOrEqual(trendBox.y)
  expect(overviewBox.y + overviewBox.height).toBeLessThanOrEqual(plotBox.y)
  expect(trendBox.y).toBeLessThan(450)
  expect(trendBox.y).toBeLessThan(connectionBox.y)
  await expect(page.getByRole('region',{name:'最近の記録'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'ヘルスケア連携'})).toHaveAttribute('aria-expanded','false')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  // Every bottom tab label stays on one line on a 375px phone.
  const navLines = await page.getByRole('navigation',{name:'メイン'}).getByRole('link').evaluateAll((links) => links.map((link) => {
    const tops = new Set<number>()
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange(); range.selectNodeContents(node)
      for (const rect of range.getClientRects()) tops.add(Math.round(rect.top))
    }
    return tops.size
  }))
  expect(navLines).toEqual([1,1,1,1,1])
  const guide = page.getByText('点はその日の記録、線は7日平均。', {exact:true})
  await expect(guide).not.toBeVisible()
  await page.getByText('グラフの見方', {exact:true}).click()
  await expect(guide).toBeVisible()
  await page.getByText('グラフの見方', {exact:true}).click()
  for (const width of [320,375,390]) {
    await page.setViewportSize({width,height:812})
    const latestBox = (await overview.boundingBox())!
    const periodBox = (await page.getByRole('group',{name:'表示期間'}).boundingBox())!
    const graphBox = (await trend.locator('svg.recharts-surface').boundingBox())!
    expect(latestBox.y + latestBox.height).toBeLessThanOrEqual(periodBox.y)
    expect(periodBox.y + periodBox.height).toBeLessThanOrEqual(graphBox.y)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:`test-results/body-simple-${width}.png`,fullPage:true})
  }
  await page.getByRole('button',{name:'ヘルスケア連携',exact:true}).click()
  await expect(page.getByText('未接続',{exact:true})).toBeVisible()
})
