import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './features/auth/SessionProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/ui/Toast'
import { LogPage } from './features/workout-log/LogPage'
import { FeedPage } from './features/feed/FeedPage'
import { HistoryPage } from './features/history/HistoryPage'
import { ExerciseDetailPage } from './features/exercises/ExerciseDetailPage'
import { MembersPage } from './features/history/MembersPage'
import { MemberDetailPage } from './features/history/MemberDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<FeedPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/members" element={<MembersPage />} />
                <Route path="/members/:userId" element={<MemberDetailPage />} />
                <Route path="/settings" element={<div className="p-4">設定</div>} />
                <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
              </Route>
              <Route path="/log" element={<LogPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
