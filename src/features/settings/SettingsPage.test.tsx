import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../components/ui/Toast'
import { SettingsPage } from './SettingsPage'

const { eq, update, from } = vi.hoisted(() => {
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { eq, update, from }
})
vi.mock('../../lib/supabase', () => ({ supabase: { from } }))

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession }))

const refreshProfile = vi.fn()
const signOut = vi.fn()

function renderPage() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSession.mockReturnValue({
      userId: 'u1',
      profile: { id: 'u1', display_name: '変更前', created_at: '2026-08-01T00:00:00Z' },
      loading: false,
      refreshProfile,
      signOut,
    })
  })

  it('prefills and saves a trimmed display name, then refreshes the profile', async () => {
    eq.mockResolvedValueOnce({ error: null })
    refreshProfile.mockResolvedValueOnce(undefined)
    renderPage()
    const user = userEvent.setup()

    const input = screen.getByRole('textbox', { name: '表示名' })
    expect(input).toHaveValue('変更前')
    await user.clear(input)
    await user.type(input, '  変更後  ')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('表示名を変更しました')).toBeInTheDocument()
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ display_name: '変更後' })
    expect(eq).toHaveBeenCalledWith('id', 'u1')
    expect(refreshProfile).toHaveBeenCalledOnce()
    expect(input).toHaveValue('変更後')
  })

  it('keeps an actionable error visible when saving fails', async () => {
    eq.mockResolvedValueOnce({ error: { message: 'network error' } })
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(refreshProfile).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('disables saving a blank display name', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.clear(screen.getByRole('textbox', { name: '表示名' }))
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('signs out once when the logout button is tapped', async () => {
    signOut.mockResolvedValueOnce(undefined)
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('recovers the logout control and shows an error when sign out fails', async () => {
    signOut.mockRejectedValueOnce(new Error('network error'))
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeEnabled()
  })
})
