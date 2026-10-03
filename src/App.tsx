import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SessionProvider } from './features/auth/SessionProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/ui/Toast'
import { ProfilePage } from './features/profile/ProfilePage'
import { HistoryPage } from './features/history/HistoryPage'
import { ExerciseDetailPage } from './features/exercises/ExerciseDetailPage'
import { WorkoutEditorPage } from './features/history/WorkoutEditorPage'
import { Big3Page } from './features/community/Big3Page'
import { RankingPage } from './features/community/RankingPage'
import { HomePage } from './features/home/HomePage'
import { ExportPage } from './features/export/ExportPage'
import { BodyPage } from './features/body/BodyPage'

// 以前のBIG3のURL（/strength?view=...）は /big3 に移した。
function StrengthRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/big3', search }} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage key="login" />} />
            <Route path="/signup" element={<LoginPage key="signup" signup />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/big3" element={<Big3Page />} />
                <Route path="/ranking" element={<RankingPage />} />
                <Route path="/log" element={null} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="/body" element={<BodyPage />} />
                <Route path="/strength" element={<StrengthRedirect />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/history/new" element={<WorkoutEditorPage key="new" />} />
                <Route path="/history/:workoutId" element={<WorkoutEditorPage />} />
                <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
