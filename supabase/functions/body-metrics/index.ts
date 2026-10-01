import { createClient } from '@supabase/supabase-js'
import { createHandler, type Counts } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const origin = Deno.env.get('HEALTH_SYNC_ALLOWED_ORIGIN') ?? 'https://gym-app-ruddy-nine.vercel.app'
if (!url || !key) throw new Error('Missing server configuration')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(createHandler(async (hash, input) => {
  const { data, error } = await client.rpc('health_sync_import', {
    p_token_hash: hash, p_records: input.records, p_mode: input.mode,
  })
  return { data: data as Counts | null, error: error ? { code: error.code } : null }
}, origin))
