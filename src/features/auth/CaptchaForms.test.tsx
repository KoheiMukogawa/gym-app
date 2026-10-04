import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { auth, captcha } = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn() },
  captcha: { token: 'tok-1' as string | undefined, ready: true, reset: vi.fn() },
}))
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }))
vi.mock('./SessionProvider', () => ({ useSession: () => ({ userId: null, loading: false }) }))
vi.mock('./captcha', () => ({ useCaptcha: () => ({ widget: <div>確認欄</div>, ...captcha }) }))
import { LoginPage } from './LoginPage'
import { ForgotPasswordPage } from './PasswordResetPages'

const renderIn = (page: React.ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>)
async function fillCredentials() {
  await userEvent.type(screen.getByLabelText('メールアドレス'), 'me@example.com')
  await userEvent.type(screen.getByLabelText('パスワード'), 'password-123')
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(captcha, { token: 'tok-1', ready: true })
  auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
})

describe('CAPTCHA on the auth forms', () => {
  it('sends the token with a login and asks again after a failure', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    renderIn(<LoginPage />)
    expect(screen.getByText('確認欄')).toBeInTheDocument()
    await fillCredentials()
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'password-123', options: { captchaToken: 'tok-1' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('メールアドレスまたはパスワードが違います')
    expect(captcha.reset).toHaveBeenCalled()
  })

  it('keeps the login button off until the check is done', async () => {
    Object.assign(captcha, { token: undefined, ready: false })
    renderIn(<LoginPage />)
    await fillCredentials()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeDisabled()
  })

  it('sends the token with a sign-up', async () => {
    renderIn(<LoginPage signup />)
    await userEvent.type(screen.getByLabelText('名前'), '新人')
    await fillCredentials()
    await userEvent.click(screen.getByRole('button', { name: 'アカウントを作成' }))
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ captchaToken: 'tok-1' }) }))
    expect(captcha.reset).toHaveBeenCalled()
  })

  it('sends the token with a reset email and waits for the check', async () => {
    Object.assign(captcha, { token: undefined, ready: false })
    const { rerender } = renderIn(<ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'me@example.com')
    expect(screen.getByRole('button', { name: '再設定メールを送る' })).toBeDisabled()
    Object.assign(captcha, { token: 'tok-2', ready: true })
    rerender(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: '再設定メールを送る' }))
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('me@example.com', { redirectTo: `${window.location.origin}/reset-password`, captchaToken: 'tok-2' })
    expect(captcha.reset).toHaveBeenCalled()
  })

  it('explains a rejected check in Japanese', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'captcha_failed', message: 'captcha protection: request disallowed' } })
    renderIn(<LoginPage />)
    await fillCredentials()
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ボットではないことの確認に失敗しました。もう一度お試しください。')
  })
})
