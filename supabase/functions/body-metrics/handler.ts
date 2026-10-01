export type RecordInput = { date: string; weight_kg: number; body_fat_pct?: number | null }
export type ImportInput = { records: RecordInput[]; mode: 'keep' | 'overwrite' }
export type Counts = { inserted: number; updated: number; skipped: number }
type ImportResult = { data: Counts | null; error: { code?: string } | null }
export type Importer = (hash: string, input: ImportInput) => Promise<ImportResult>
const MAX_BYTES = 256 * 1024
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validateInput(value: unknown): ImportInput | null {
  if (!object(value) || Object.keys(value).some(k => !['records', 'mode'].includes(k))) return null
  if (value.mode !== undefined && value.mode !== 'keep' && value.mode !== 'overwrite') return null
  if (!Array.isArray(value.records) || value.records.length < 1 || value.records.length > 500) return null
  const seen = new Set<string>()
  for (const record of value.records) {
    if (!object(record) || Object.keys(record).some(k => !['date', 'weight_kg', 'body_fat_pct'].includes(k))
      || !validDate(record.date) || seen.has(record.date)
      || typeof record.weight_kg !== 'number' || !Number.isFinite(record.weight_kg) || record.weight_kg < 20 || record.weight_kg > 300
      || (record.body_fat_pct !== undefined && record.body_fat_pct !== null
        && (typeof record.body_fat_pct !== 'number' || !Number.isFinite(record.body_fat_pct) || record.body_fat_pct < 1 || record.body_fat_pct > 70))) return null
    seen.add(record.date)
  }
  return { records: value.records as RecordInput[], mode: value.mode ?? 'keep' }
}
export function createHandler(importRecords: Importer, allowedOrigin: string) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' })
    if (origin === allowedOrigin) {
      headers.set('Access-Control-Allow-Origin', allowedOrigin)
      headers.set('Access-Control-Allow-Headers', 'authorization, content-type')
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    }
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return origin === allowedOrigin ? new Response(null, { status: 204, headers }) : reply(403, { error: 'Forbidden' })
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
    const match = /^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get('authorization') ?? '')
    if (!match) return reply(401, { error: 'Invalid credential' })
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'JSON required' })
    const declared = request.headers.get('content-length')
    if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_BYTES) return reply(413, { error: 'Request too large' })
    try {
      const reader = request.body?.getReader()
      if (!reader) return reply(400, { error: 'Invalid records' })
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_BYTES) {
            await reader.cancel().catch(() => undefined)
            return reply(413, { error: 'Request too large' })
          }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      let input: ImportInput | null
      try { input = validateInput(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) }
      catch { return reply(400, { error: 'Invalid records' }) }
      if (!input) return reply(400, { error: 'Invalid records' })
      // Hash the exact token bytes; the raw token never reaches the database.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1]))
      const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
      const result = await importRecords(hash, input)
      if (result.error?.code === '28000') return reply(401, { error: 'Invalid credential' })
      if (result.error?.code === '22023') return reply(400, { error: 'Invalid records' })
      if (result.error || !result.data) return reply(500, { error: 'Synchronization failed' })
      return reply(200, result.data)
    } catch { return reply(500, { error: 'Synchronization failed' }) }
  }
}
