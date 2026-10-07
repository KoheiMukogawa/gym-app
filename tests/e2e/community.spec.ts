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
    if(endpoint==='profiles') return send({id:uid,display_name:mine?.display_name??'Private name',icon:mine?.icon??'initials'})
    if(endpoint==='community_profiles') return send(mine)
    if(endpoint==='save_glog_profile') {
      if(failSave) { failSave=false; return send({message:'保存エラー'},500) }
      mine={user_id:uid,display_name:body.p_name,icon:body.p_icon,bio:body.p_bio,global_ranking:body.p_global};return send(null)
    }
    if(endpoint==='community_list') return send(groups)
    if(endpoint==='community_manage') {
      if(body.p_action==='create') groups.push({id:'group1',name:body.p_value,owner_id:uid,invite_code:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
      if(body.p_action==='join') groups.push({id:'group2',name:'友達のジム',owner_id:'other',invite_code:null})
      if(body.p_action==='leave') groups.splice(groups.findIndex(g=>g.id===body.p_id),1)
      if(body.p_action==='rotate') groups[0].invite_code='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      return send(body.p_action==='join'?'group2':'group1')
    }
    if(endpoint==='community_ranking'||endpoint==='global_ranking') {
      if(endpoint==='community_ranking'&&failRanking) { failRanking=false; return send({message:'ランキング通信エラー'},500) }
      if(!mine) return send([])
      const members: Member[]=[
        {...mine!,total:450,growth:20,lifts:{squat:150,bench:100,deadlift:200},points:[{lift:'bench',date:'2026-09-01',value:90},{lift:'bench',date:'2026-10-01',value:100}]},
        {user_id:'other',display_name:'ジム仲間',icon:'🔥',bio:'一緒に頑張ろう',total:450,growth:null,lifts:{squat:160,bench:100,deadlift:190},points:[]},
      ]
      return send(members)
    }
    return send([])
  })
  await page.goto('/strength?view=ranking')
  await page.getByLabel('メールアドレス').fill('test@example.com')
  await page.getByLabel('パスワード').fill('mock-password')
  await page.getByRole('button',{name:'ログイン',exact:true}).click()
  // Navigating before the session is saved lands back on the login page.
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto('/strength?view=ranking')
  await expect(page.getByRole('heading',{name:'ランキング',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'全体',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'コミュニティに参加・作成'}).click()
  // ＋の間はランキングを出さず、作成・参加だけを見せる
  await expect(page.getByRole('region',{name:'全体ランキング'})).toHaveCount(0)
  // 選択中に見えるのは＋だけ。範囲チップは選択表示を外す
  await expect(page.getByRole('button',{name:'全体',exact:true})).toHaveAttribute('aria-pressed','false')
  await expect(page.getByRole('button',{name:'コミュニティに参加・作成'})).toHaveAttribute('aria-expanded','true')
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
  await expect(page.getByRole('button',{name:'筋トレ部',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('button',{name:'コミュニティに参加・作成'})).toHaveAttribute('aria-expanded','false')
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
  // ⊕ は開閉式なので、閉じているときだけ押す
  const plus = page.getByRole('button',{name:'コミュニティに参加・作成'})
  if (await plus.getAttribute('aria-expanded') !== 'true') await plus.click()
  await page.getByRole('button',{name:'招待コードで参加'}).click()
  await page.getByLabel('招待コード',{exact:true}).fill('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  await page.getByRole('button',{name:'参加する',exact:true}).click()
  await expect(page.getByRole('button',{name:'友達のジム',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'コミュニティから退出'}).click()
  await page.getByRole('button',{name:'確定する'}).click()
  await expect(page.getByRole('button',{name:'友達のジム',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'全体',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'プロフィールメニュー'}).click()
  await page.getByRole('link',{name:'プロフィールを編集'}).click()
  await page.getByLabel('名前',{exact:true}).fill('コウヘイ2')
  await page.getByRole('button',{name:'ターゲット',exact:true}).click()
  await page.getByLabel('全体ランキングに参加する').check()
  await page.getByRole('button',{name:'プロフィールを保存'}).click()
  await expect(page.getByRole('status')).toContainText('保存しました')
  expect(mine).toMatchObject({display_name:'コウヘイ2',icon:'target',global_ranking:true})
  // The ranking has its own bottom tab now.
  await page.getByRole('navigation',{name:'メイン'}).getByRole('link',{name:'ランキング',exact:true}).click()
  await expect(page).toHaveURL(/\/ranking$/)
  await expect(page.getByRole('region',{name:'全体ランキング'})).toBeVisible()
  await expect(page.getByRole('listitem').filter({hasText:'コウヘイ2'})).toContainText('450 kg')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  // 説明はランキングの下。まず順位が見えること。
  const list = await page.getByRole('listitem').first().boundingBox()
  const note = await page.getByText('公開を選んだ利用者のランキングです',{exact:false}).boundingBox()
  expect(note!.y).toBeGreaterThan(list!.y)
  // ＋を押すと作成・参加だけになり、チップを押せば押し直さずにランキングへ戻る
  await page.getByRole('button',{name:'コミュニティに参加・作成'}).click()
  await expect(page.getByRole('button',{name:'招待コードで参加'})).toBeVisible()
  await expect(page.getByRole('region',{name:'全体ランキング'})).toHaveCount(0)
  await page.getByRole('button',{name:'全体',exact:true}).click()
  await expect(page.getByRole('button',{name:'招待コードで参加'})).toHaveCount(0)
  await expect(page.getByRole('region',{name:'全体ランキング'})).toBeVisible()
})
