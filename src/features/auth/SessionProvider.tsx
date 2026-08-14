import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../lib/types'

type SessionValue = {
  userId: string | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
    if (error) {
      // profiles の行が無いままログインできてしまう状態は、原因の手がかりが残らないと追えない。
      // docs/setup-supabase.md のトリガー手動フォールバックを取りこぼすと実際に起きる。
      console.error(`profiles の取得に失敗しました (user: ${id})`, error)
      setProfile(null)
      return
    }
    setProfile((data as Profile) ?? null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId)
  }, [userId, loadProfile])

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const id = data.session?.user.id ?? null
        setUserId(id)
        if (id) loadProfile(id).finally(() => setLoading(false))
        else setLoading(false)
      })
      .catch((error: unknown) => {
        // getSession は内部でストレージのロックを取りに行き、取得できないと例外を投げる
        // （複数タブで開いたときに起きる）。ここで握ると loading が false にならず、
        // RequireAuth がスピナーを回したまま復帰しなくなる。
        console.error('セッションの取得に失敗しました', error)
        setUserId(null)
        setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null
      setUserId(id)
      if (id) loadProfile(id)
      else setProfile(null)
    })

    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <SessionContext.Provider value={{ userId, profile, loading, signOut, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
