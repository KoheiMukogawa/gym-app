import { expect, test } from '@playwright/test'
test('public introduction and signup save name and icon in registration metadata',async({page})=>{
 let registration: Record<string,unknown>|null=null
 await page.route('https://example.supabase.co/**',async route=>{
  const url=new URL(route.request().url()),method=route.request().method()
  if(method==='OPTIONS')return route.fulfill({status:204})
  if(url.pathname.endsWith('/signup')){registration=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify({user:{id:'new-user',email:'new@example.com'},session:null})})}
  return route.fulfill({contentType:'application/json',body:JSON.stringify([])})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:/今日の積み重ね/})).toBeVisible()
 await page.getByRole('link',{name:'アカウントを作って始める'}).click()
 await page.getByLabel('名前',{exact:true}).fill('新人')
 await page.getByRole('button',{name:'バーベル',exact:true}).click()
 await page.getByLabel('メールアドレス').fill('new@example.com')
 await page.getByLabel('パスワード').fill('strong-password-123')
 await page.getByRole('button',{name:'アカウントを作成',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('確認メール')
 expect(registration).toMatchObject({data:{display_name:'新人',profile_icon:'barbell'}})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
