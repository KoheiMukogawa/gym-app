import { lazy, Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '../../components/ui/Spinner'
import { useSession } from './SessionProvider'
import { IS_NATIVE } from '../../lib/native'

const LandingPage = lazy(() => import('./LandingPage').then(module => ({ default: module.LandingPage })))

export function RequireAuth() {
  const location = useLocation()
  const { userId, loading } = useSession()
  if (loading) return <Spinner />
  // アプリ版は紹介ページを出さず、ログイン画面から始める
  if (!userId && location.pathname === '/' && !IS_NATIVE) return <Suspense fallback={<Spinner />}><LandingPage /></Suspense>
  if (!userId) return <Navigate to="/login" replace />
  return <Outlet />
}
