import { expect, test } from '@playwright/test'
import type { Community, CommunityProfile, Member } from '../../src/features/community/queries'

test('community profile, create, ranking retry, ties, member detail, join and leave', async ({ page }) => {
  const uid = '11111111-1111-4111-8111-111111111111'
  let mine: CommunityProfile | null = null
  const groups: Community[] = []
  let failRanking = true
  let failSave = true
  const session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {} } }
  await page.route('https://example.supabase.co/**', async (route) => {
    const req=route.request(), endpoint=new URL(req.url()).pathname.split('/').at(-1)
    const body=req.postData() ? req.postDataJSON() : null
    const send=(data: unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
    if(req.method()==='OPTIONS') return route.fulfill({status:204})
    if(endpoint==='token') return send(session)
    if(endpoint==='user') return send(session.user)
    if(endpoint==='profiles') return send({id:uid,display_name:'Private name'})
    if(endpoint==='community_profiles') {
      if(req.method()==='POST') {
        if(failSave) { failSave=false; return send({message:'保存を再試行してください'},500) }
        mine=body; return send(null)
      }
      return send(mine)
    }
    if(endpoint==='community_list') return send(groups)
    if(endpoint==='community_manage') {
      if(body.p_action==='create') groups.push({id:'group1',name:body.p_value,owner_id:uid,invite_code:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
      if(body.p_action==='join') groups.push({id:'group2',name:'友達のジム',owner_id:'other',invite_code:null})
      if(body.p_action==='leave') groups.splice(groups.findIndex(g=>g.id===body.p_id),1)
      if(body.p_action==='rotate') groups[0].invite_code='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      return send(body.p_action==='join'?'group2':'group1')
    }
    if(endpoint==='community_ranking') {
      if(failRanking) { failRanking=false; return send({message:'ランキング通信エラー'},500) }
      const members: Member[]=[
        {...mine!,total:450,growth:20,lifts:{squat:150,bench:100,deadlift:200},points:[{lift:'bench',date:'2026-09-01',value:90},{lift:'bench',date:'2026-10-01',value:100}]},
        {user_id:'other',display_name:'ジム仲間',icon:'🔥',bio:'一緒に頑張ろう',total:450,growth:null,lifts:{squat:160,bench:100,deadlift:190},points:[]},
      ]
      return send(members)
    }
    return send([])
  })
  await page.goto('/strength?view=community')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button',{name:'ログイン',exact:true}).click()
  await page.goto('/strength?view=community')
  await page.getByRole('button',{name:/プロフィールを作る/}).click()
  await page.getByLabel('表示名').fill('コウヘイ')
  await page.getByLabel('ひとこと').fill('500kgを目指す')
  await page.getByRole('button',{name:'プロフィールを保存'}).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('表示名')).toHaveValue('コウヘイ')
  await page.getByRole('button',{name:'プロフィールを保存'}).click()
  await page.getByRole('button',{name:'＋ コミュニティを作る'}).click()
  await page.getByLabel('コミュニティ名').fill('筋トレ部')
  await page.getByRole('button',{name:'作成する',exact:true}).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button',{name:'再試行',exact:true}).click()
  await expect(page.getByRole('button',{name:/1.*コウヘイ.*450 kg/})).toBeVisible()
  await expect(page.getByRole('button',{name:/1.*ジム仲間.*450 kg/})).toBeVisible()
  await page.getByRole('button',{name:/ジム仲間.*450 kg/}).click()
  await expect(page.getByRole('region',{name:'メンバーの記録'})).toContainText('一緒に頑張ろう')
  await page.getByRole('button',{name:'閉じる',exact:true}).click()
  await page.getByRole('button',{name:'今月の伸び',exact:true}).click()
  await expect(page.getByRole('button',{name:/コウヘイ.*\+20 kg/})).toBeVisible()
  await expect(page.getByRole('button',{name:/ジム仲間.*—/})).toBeVisible()
  await page.screenshot({path:'test-results/community-mobile.png',fullPage:true})
  await page.getByText('招待コード',{exact:true}).click()
  await page.getByRole('button',{name:'コードを再発行'}).click()
  await page.getByRole('button',{name:'確定する'}).click()
  await page.getByText('招待コード',{exact:true}).click()
  await expect(page.getByText('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBeVisible()
  await page.getByText('プロフィール・参加管理',{exact:true}).click()
  await page.getByRole('button',{name:'招待コードで参加'}).click()
  await page.getByLabel('招待コード',{exact:true}).fill('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  await page.getByRole('button',{name:'参加する',exact:true}).click()
  await expect(page.getByRole('combobox',{name:'コミュニティ',exact:true})).toHaveValue('group2')
  await page.getByRole('button',{name:'コミュニティから退出'}).click()
  await page.getByRole('button',{name:'確定する'}).click()
  await expect(page.getByRole('combobox',{name:'コミュニティ',exact:true})).toHaveValue('group1')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
