import { Navigate, useSearchParams } from 'react-router-dom'
import { StrengthPage } from '../strength/StrengthPage'

// The ranking used to be a view of this page (/big3?view=ranking); old links go to its own page.
export function Big3Page() {
  const [params] = useSearchParams()
  return params.get('view') === null ? <StrengthPage /> : <Navigate to="/ranking" replace />
}
