import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
                <Route path="/" element={null} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/strength" element={<Big3Page />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/history/new" element={<WorkoutEditorPage key="new" />} />
                <Route path="/history/:workoutId" element={<WorkoutEditorPage />} />
                <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
              </Route>
              <Route path="/log" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
