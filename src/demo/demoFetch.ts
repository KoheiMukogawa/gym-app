import { DEMO_PROFILE, demoRpc, demoTables, type Row } from './demoData'

// 見本のアプリ（/demo）の通信を受ける、小さなPostgREST。サーバーには一切送らない。
// アプリが使う読み取り（列での絞り込み・並べ替え・件数・埋め込んだ表）と、追加・更新・削除に答える。
// 書き込みはこのページの中だけに残り、閉じれば消える（見本でも記録の操作を試せるように）。

const tables = demoTables()

/** 埋め込める表（select の `workout_sets ( ... )` など）。外部キーのたどり方 */
const RELATIONS: Record<string, Record<string, { table: string; many: boolean; local: string; foreign: string }>> = {
  workouts: {
    profiles: { table: 'profiles', many: false, local: 'user_id', foreign: 'id' },
    workout_sets: { table: 'workout_sets', many: true, local: 'id', foreign: 'workout_id' },
  },
  workout_sets: {
    exercises: { table: 'exercises', many: false, local: 'exercise_id', foreign: 'id' },
    workouts: { table: 'workouts', many: false, local: 'workout_id', foreign: 'id' },
  },
}

function embed(table: string, row: Row, depth = 0): Row {
  if (depth > 1) return row
  const out: Row = { ...row }
  for (const [name, rel] of Object.entries(RELATIONS[table] ?? {})) {
    const matches = tables[rel.table].filter((r) => r[rel.foreign] === row[rel.local])
    // 子から親へ戻る向き（workout_sets → workouts → workout_sets）は1段まで
    const next = (r: Row) => rel.table === table ? r : embed(rel.table, r, depth + 1)
    out[name] = rel.many ? matches.map(next) : matches[0] ? next(matches[0]) : null
  }
  return out
}

const ISO_TIME = /^\d{4}-\d\d-\d\dT/
function compare(a: unknown, b: string): number {
  if (typeof a === 'number') return a - Number(b)
  const text = String(a)
  if (ISO_TIME.test(text) && ISO_TIME.test(b)) return Date.parse(text) - Date.parse(b)
  return text < b ? -1 : text > b ? 1 : 0
}

function matches(value: unknown, filter: string): boolean {
  const dot = filter.indexOf('.')
  const op = filter.slice(0, dot), arg = decodeURIComponent(filter.slice(dot + 1))
  switch (op) {
    case 'eq': return value !== null && value !== undefined && compare(value, arg) === 0
    case 'neq': return compare(value, arg) !== 0
    case 'gt': return compare(value, arg) > 0
    case 'gte': return compare(value, arg) >= 0
    case 'lt': return compare(value, arg) < 0
    case 'lte': return compare(value, arg) <= 0
    case 'is': return arg === 'null' ? value === null || value === undefined : String(value) === arg
    case 'in': return arg.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')).some((v) => compare(value, v) === 0)
    default: return true
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

function readTable(table: string, params: URLSearchParams, headers: Headers, head: boolean): Response {
  const select = params.get('select') ?? '*'
  let rows = (tables[table] ?? []).map((row) => embed(table, row))
  for (const [key, filter] of params) {
    if (RESERVED.has(key) || key.endsWith('.order') || key.endsWith('.limit')) continue
    const [first, column] = key.includes('.') ? key.split('.') : [key, null]
    if (column === null) { rows = rows.filter((row) => matches(row[first], filter)); continue }
    // 埋め込んだ表の列での絞り込み。`!inner` なら、合うものがない行ごと外す
    const inner = new RegExp(`${first}!inner`).test(select)
    rows = rows.flatMap((row) => {
      const nested = row[first]
      if (Array.isArray(nested)) {
        const kept = nested.filter((r: Row) => matches(r[column], filter))
        return inner && kept.length === 0 ? [] : [{ ...row, [first]: kept }]
      }
      const ok = nested !== null && typeof nested === 'object' && matches((nested as Row)[column], filter)
      return ok || !inner ? [row] : []
    })
  }
  const order = params.get('order')
  if (order) {
    const keys = order.split(',').map((part) => { const [column, direction, nulls] = part.split('.'); return { column, desc: direction === 'desc', nulls } })
    rows = [...rows].sort((a, b) => {
      for (const { column, desc } of keys) {
        const x = a[column], y = b[column]
        if (x === y) continue
        if (x === null || x === undefined) return 1
        if (y === null || y === undefined) return -1
        const c = compare(x, String(y))
        if (c !== 0) return desc ? -c : c
      }
      return 0
    })
  }
  const total = rows.length
  const offset = Number(params.get('offset') ?? 0)
  const limit = params.get('limit')
  rows = rows.slice(offset, limit === null ? undefined : offset + Number(limit))
  const range = { 'Content-Range': `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${total}` }
  if (head) return new Response(null, { status: 200, headers: range })
  if (headers.get('Accept')?.includes('vnd.pgrst.object')) {
    if (rows.length !== 1) return json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null }, 406)
    return json(rows[0], 200, range)
  }
  return json(rows, 200, range)
}

const topLevelFilters = (params: URLSearchParams) =>
  [...params].filter(([key]) => !RESERVED.has(key) && !key.includes('.'))

function newRow(table: string, values: Row): Row {
  const now = new Date().toISOString()
  return { ...(table === 'bodyweight_logs' ? {} : { id: crypto.randomUUID() }), created_at: now, ...values }
}

function writeTable(table: string, method: string, params: URLSearchParams, headers: Headers, text: string): Response {
  const rows = (tables[table] ??= [])
  const body = text ? JSON.parse(text) as Row | Row[] : {}
  const prefer = headers.get('Prefer') ?? ''
  let changed: Row[] = []
  if (method === 'POST') {
    const conflict = (params.get('on_conflict') ?? 'id').split(',')
    const merge = prefer.includes('resolution=merge-duplicates')
    for (const values of Array.isArray(body) ? body : [body]) {
      const existing = merge ? rows.find((row) => conflict.every((column) => values[column] !== undefined && row[column] === values[column])) : undefined
      if (existing) { Object.assign(existing, values); changed.push(existing) }
      else { const row = newRow(table, values); rows.push(row); changed.push(row) }
    }
  } else {
    const filters = topLevelFilters(params)
    changed = rows.filter((row) => filters.every(([key, filter]) => matches(row[key], filter)))
    if (method === 'PATCH') changed.forEach((row) => Object.assign(row, body))
    if (method === 'DELETE') tables[table] = rows.filter((row) => !changed.includes(row))
  }
  if (!prefer.includes('return=representation')) return new Response(null, { status: method === 'POST' ? 201 : 204 })
  const out = changed.map((row) => embed(table, row))
  if (headers.get('Accept')?.includes('vnd.pgrst.object')) return json(out[0] ?? null, out.length === 1 ? 200 : 406)
  return json(out, method === 'POST' ? 201 : 200)
}

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init)
  const url = new URL(request.url)
  const method = request.method.toUpperCase()
  const path = url.pathname

  if (path.startsWith('/auth/v1/')) {
    if (path.endsWith('/user')) return json({ id: DEMO_PROFILE.id, aud: 'authenticated', role: 'authenticated', email: 'demo@example.com', app_metadata: {}, user_metadata: {} })
    return json({}, 204)
  }
  if (path.startsWith('/rest/v1/rpc/')) {
    const name = path.slice('/rest/v1/rpc/'.length)
    // 見本で答えない関数（設定の保存・既読など）は、何もせずに成功したことにする
    return json(demoRpc(name, tables) ?? null)
  }
  if (path.startsWith('/rest/v1/')) {
    const table = path.slice('/rest/v1/'.length)
    if (method === 'GET' || method === 'HEAD') return readTable(table, url.searchParams, request.headers, method === 'HEAD')
    return writeTable(table, method, url.searchParams, request.headers, await request.text())
  }
  // Storage（写真）などは使わない
  return json({ message: 'not available in the demo' }, 404)
}
