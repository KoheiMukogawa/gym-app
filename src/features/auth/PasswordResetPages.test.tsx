import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import { ForgotPasswordPage, ResetPasswordPage } from './PasswordResetPages'

const { resetPasswordForEmail, updateUser, session } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
  session: { userId: 'u1' as string | null, loading: false },
}))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { resetPasswordForEmail, updateUser } } }))
vi.mock('./SessionProvider', () => ({ useSession: () => session }))

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><ToastProvider><Routes>
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/" element={<p>ホーム</p>} />
  </Routes></ToastProvider></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  session.userId = 'u1'; session.loading = false
})

describe('ForgotPasswordPage', () => {
  it('sends a reset link that comes back to the reset page', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })
    renderAt('/forgot-password')
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: '再設定メールを送る' }))
    expect(resetPasswordForEmail).toHaveBeenCalledWith('me@example.com', { redirectTo: `${window.location.origin}/reset-password` })
    expect(await screen.findByRole('status')).toHaveTextContent('me@example.com に再設定用のメールを送りました')
  })
  it('keeps the form and explains a send limit', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: 'over_email_send_rate_limit' } })
    renderAt('/forgot-password')
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: '再設定メールを送る' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('メールの送信回数が上限に達しました')
    expect(screen.getByLabelText('メールアドレス')).toHaveValue('me@example.com')
  })
})

describe('ResetPasswordPage', () => {
  it('sets the new password and goes home', async () => {
    updateUser.mockResolvedValue({ error: null })
    renderAt('/reset-password')
    await userEvent.type(screen.getByLabelText('新しいパスワード'), 'new-secret-1')
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを変更' }))
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-secret-1' })
    expect(await screen.findByText('ホーム')).toBeInTheDocument()
    expect(screen.getByText('パスワードを変更しました')).toBeInTheDocument()
  })
  it('stays on the form when Supabase rejects the password', async () => {
    updateUser.mockResolvedValue({ error: { code: 'same_password' } })
    renderAt('/reset-password')
    await userEvent.type(screen.getByLabelText('新しいパスワード'), 'old-secret-1')
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを変更' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('今のパスワードとは別のパスワード')
    expect(screen.getByRole('button', { name: 'パスワードを変更' })).toBeEnabled()
  })
  it('offers a new link when the email link did not sign in', () => {
    session.userId = null
    renderAt('/reset-password')
    expect(screen.getByRole('alert')).toHaveTextContent('有効期限が切れているか、すでに使われています')
    expect(screen.getByRole('link', { name: '再設定メールを送り直す' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.queryByLabelText('新しいパスワード')).not.toBeInTheDocument()
  })
})
