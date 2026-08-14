import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './features/auth/SessionProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/ui/Toast'

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<div className="p-4">ホーム</div>} />
                <Route path="/history" element={<div className="p-4">履歴</div>} />
                <Route path="/members" element={<div className="p-4">メンバー</div>} />
                <Route path="/settings" element={<div className="p-4">設定</div>} />
                <Route path="/exercises/:exerciseId" element={<div className="p-4">種目詳細</div>} />
              </Route>
              <Route path="/log" element={<div className="p-4">記録</div>} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
