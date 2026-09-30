import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './features/auth/SessionProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/ui/Toast'
import { LogPage } from './features/workout-log/LogPage'
import { HistoryPage } from './features/history/HistoryPage'
import { ExerciseDetailPage } from './features/exercises/ExerciseDetailPage'
import { WorkoutEditorPage } from './features/history/WorkoutEditorPage'
import { StrengthPage } from './features/strength/StrengthPage'

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<LogPage home />} />
                <Route path="/strength" element={<StrengthPage />} />
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
