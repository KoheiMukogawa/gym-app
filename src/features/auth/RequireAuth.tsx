import { LandingPage } from './LandingPage'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '../../components/ui/Spinner'
import { useSession } from './SessionProvider'

export function RequireAuth() {
  const location = useLocation()
  const { userId, loading } = useSession()
  if (loading) return <Spinner />
  if (!userId && location.pathname === '/') return <LandingPage />
  if (!userId) return <Navigate to="/login" replace />
  return <Outlet />
}
