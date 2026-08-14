import { Navigate, Outlet } from 'react-router-dom'
import { Spinner } from '../../components/ui/Spinner'
import { useSession } from './SessionProvider'

export function RequireAuth() {
  const { userId, loading } = useSession()
  if (loading) return <Spinner />
  if (!userId) return <Navigate to="/login" replace />
  return <Outlet />
}
