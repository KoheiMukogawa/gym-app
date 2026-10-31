import { createClient } from '@supabase/supabase-js'
import { DEMO_USER_ID, IS_DEMO } from './demoMode'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env.local に設定してください')
}

// 紹介ページの見本（/demo）はサーバーに通信せず、見本のデータを返す（src/demo/demoFetch.ts）。
// ログインの状態も端末に保存しない（本物のログインと同じ保存場所を上書きしないため）。
function demoOptions() {
  const session = JSON.stringify({
    access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: DEMO_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.com', app_metadata: {}, user_metadata: {}, created_at: '2024-12-01T00:00:00Z' },
  })
  const memory = new Map<string, string>()
  return {
    auth: {
      persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'glog-demo',
      storage: {
        getItem: (key: string) => memory.get(key) ?? (key === 'glog-demo' ? session : null),
        setItem: (key: string, value: string) => { memory.set(key, value) },
        removeItem: (key: string) => { memory.delete(key) },
      },
    },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => import('../demo/demoFetch').then((m) => m.demoFetch(input, init)) },
  }
}

export const supabase = createClient(url, anonKey, IS_DEMO ? demoOptions() : {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
