// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createHash, webcrypto } from 'node:crypto'
import { createHandler, validateInput } from './handler'
vi.stubGlobal('crypto', webcrypto)
const token='a'.repeat(64)
const record={date:'2024-02-29',weight_kg:70.24,body_fat_pct:15.4}
const good=()=>vi.fn().mockResolvedValue({data:{inserted:1,updated:0,skipped:0},error:null})
function req(body: unknown = {records:[record]}, headers: Record<string,string> = {}, method='POST') {
 return new Request('https://example.invalid/body-metrics',{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers},
 ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})})
}
describe('strict batch validation',()=>{
 it('supports default keep, explicit overwrite, null/absent fat and bounds',()=>{
  expect(validateInput({records:[{date:'0001-01-01',weight_kg:20,body_fat_pct:1},{date:'9999-12-31',weight_kg:300,body_fat_pct:70}]})).toMatchObject({mode:'keep'})
  expect(validateInput({records:[{...record,body_fat_pct:null}],mode:'overwrite'})).not.toBeNull()
  expect(validateInput({records:[{date:record.date,weight_kg:70}]})).not.toBeNull()
 })
 it.each([
  null,[],{}, {records:[]}, {records:[record],user_id:'other'}, {records:[record],mode:null}, {records:[record],mode:'delete'},
  {records:[{...record,date:'2023-02-29'}]}, {records:[{...record,date:'2024-04-31'}]}, {records:[{...record,date:'0000-01-01'}]},
  {records:[{...record,date:'2024-2-29'}]}, {records:[{...record,weight_kg:'70'}]}, {records:[{...record,weight_kg:NaN}]},
  {records:[{...record,weight_kg:Infinity}]}, {records:[{...record,weight_kg:19.99}]}, {records:[{...record,weight_kg:300.01}]},
  {records:[{...record,body_fat_pct:'15'}]}, {records:[{...record,body_fat_pct:0}]}, {records:[{...record,body_fat_pct:70.01}]},
  {records:[{...record,owner:'other'}]}, {records:[record,record]}, {records:new Array(501).fill(record)},
 ])('rejects invalid input %#',value=>expect(validateInput(value)).toBeNull())
})
describe('HTTP handler',()=>{
 it('hashes exact raw credential and forwards validated input only',async()=>{
  const importer=good(); const response=await createHandler(importer,'https://app.invalid')(req())
  expect(response.status).toBe(200); expect(await response.json()).toEqual({inserted:1,updated:0,skipped:0})
  expect(importer).toHaveBeenCalledWith(createHash('sha256').update(token).digest('hex'),{records:[record],mode:'keep'})
  expect(JSON.stringify(importer.mock.calls)).not.toContain(token)
  expect(response.headers.get('cache-control')).toBe('no-store')
 })
 it.each(['', 'Bearer bad', 'Basic '+token, 'Bearer '+token+' extra'])('rejects malformed auth %s',async auth=>{
  const importer=good(); expect((await createHandler(importer,'x')(req(undefined,{authorization:auth}))).status).toBe(401)
  expect(importer).not.toHaveBeenCalled()
 })
 it('rejects content type and invalid JSON before import',async()=>{
  const importer=good(),handler=createHandler(importer,'x')
  expect((await handler(req(undefined,{'content-type':'text/plain'}))).status).toBe(415)
  expect((await handler(req('{broken'))).status).toBe(400)
  expect((await handler(req({records:[record,record]}))).status).toBe(400)
  expect(importer).not.toHaveBeenCalled()
 })
 it('limits actual bytes even with missing or lying Content-Length',async()=>{
  const importer=good(),handler=createHandler(importer,'x')
  for(const headers of [{},{'content-length':'1'}] as Record<string,string>[]) expect((await handler(req(' '.repeat(262145),headers))).status).toBe(413)
  expect((await handler(req({}, {'content-length':'262145'}))).status).toBe(413)
  expect(importer).not.toHaveBeenCalled()
 })
 it('allows exactly 256KiB and 500 distinct days',async()=>{
  const importer=good(),handler=createHandler(importer,'x')
  const body=JSON.stringify({records:[record]})
  expect((await handler(req(body+' '.repeat(262144-body.length)))).status).toBe(200)
  const records=Array.from({length:500},(_,i)=>({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),weight_kg:70}))
  expect((await handler(req({records}))).status).toBe(200)
 })
 it.each([['28000',401,'Invalid credential'],['22023',400,'Invalid records'],['XX000',500,'Synchronization failed']])('sanitizes database error %s',async(code,status,error)=>{
  const importer=vi.fn().mockResolvedValue({data:null,error:{code,message:'token and Health detail'}})
  const response=await createHandler(importer,'x')(req())
  expect(response.status).toBe(status);expect(await response.json()).toEqual({error})
 })
 it('sanitizes thrown failure',async()=>{
  const response=await createHandler(vi.fn().mockRejectedValue(new Error('secret')),'x')(req())
  expect(response.status).toBe(500);expect(await response.text()).not.toContain('secret')
 })
 it('accepts only POST and approved origin preflight',async()=>{
  const importer=good(),handler=createHandler(importer,'https://app.invalid')
  expect((await handler(req(undefined,{},'GET'))).status).toBe(405)
  expect((await handler(req(undefined,{origin:'https://evil.invalid'},'OPTIONS'))).status).toBe(403)
  const response=await handler(req(undefined,{origin:'https://app.invalid'},'OPTIONS'))
  expect(response.status).toBe(204);expect(response.headers.get('access-control-allow-origin')).toBe('https://app.invalid')
  expect(importer).not.toHaveBeenCalled()
  expect((await handler(req())).headers.get('access-control-allow-origin')).toBeNull()
  expect(importer).toHaveBeenCalledTimes(1)
 })
})
