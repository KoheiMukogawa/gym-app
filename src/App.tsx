import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SessionProvider } from './features/auth/SessionProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './features/auth/PasswordResetPages'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/ui/Toast'
import { HomePage } from './features/home/HomePage'

// Screens other than home and recording load on first visit, so charts and
// rankings do not slow down opening the app. The service worker precaches them.
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const HistoryPage = lazy(() => import('./features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const ExerciseDetailPage = lazy(() => import('./features/exercises/ExerciseDetailPage').then((m) => ({ default: m.ExerciseDetailPage })))
const WorkoutEditorPage = lazy(() => import('./features/history/WorkoutEditorPage').then((m) => ({ default: m.WorkoutEditorPage })))
const Big3Page = lazy(() => import('./features/community/Big3Page').then((m) => ({ default: m.Big3Page })))
const RankingPage = lazy(() => import('./features/community/RankingPage').then((m) => ({ default: m.RankingPage })))
const ExportPage = lazy(() => import('./features/export/ExportPage').then((m) => ({ default: m.ExportPage })))
const BodyPage = lazy(() => import('./features/body/BodyPage').then((m) => ({ default: m.BodyPage })))
const DeleteAccountPage = lazy(() => import('./features/account/DeleteAccountPage').then((m) => ({ default: m.DeleteAccountPage })))

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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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
                <Route path="/account/delete" element={<DeleteAccountPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
