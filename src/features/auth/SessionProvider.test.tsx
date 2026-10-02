import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SessionProvider, useSession } from './SessionProvider'

const { getSession, onAuthStateChange, single, signOut } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  single: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signOut },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  },
}))

function Probe() {
  const { userId, profile, loading, signOut, refreshProfile } = useSession()
  const [result, setResult] = useState('')
  async function run(action: () => Promise<void>) {
    try {
      await action()
      setResult('success')
    } catch {
      setResult('error')
    }
  }
  return (
    <>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="userId">{userId ?? 'null'}</span>
      <span data-testid="profile">{profile?.display_name ?? 'null'}</span>
      <button onClick={() => void run(signOut)}>logout</button>
      <button onClick={() => void run(refreshProfile)}>refresh</button>
      <span data-testid="result">{result}</span>
    </>
  )
}

function renderProvider() {
  return render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  )
}

describe('SessionProvider', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('stops loading and stays signed out when getSession rejects', async () => {
    // 複数タブで開いたときにストレージのロックが取れず、getSession が例外を投げる場合。
    // ここで loading が解除されないと、RequireAuth がスピナーのまま復帰しない。
    getSession.mockRejectedValue(new Error('Acquiring an exclusive Navigator LockManager lock failed'))

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('userId')).toHaveTextContent('null')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('surfaces a missing profile instead of swallowing it', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    single.mockResolvedValue({ data: null, error: { message: 'no rows returned' } })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('userId')).toHaveTextContent('user-1')
    expect(screen.getByTestId('profile')).toHaveTextContent('null')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('exposes the profile once it loads', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    single.mockResolvedValue({
      data: { id: 'user-1', display_name: 'たろう', created_at: '2026-08-01T00:00:00Z' },
      error: null,
    })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('たろう'))
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('opens the app once the session is known, without waiting for the profile', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    single.mockReturnValue(new Promise(() => {}))

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('userId')).toHaveTextContent('user-1')
    expect(screen.getByTestId('profile')).toHaveTextContent('null')
  })

  it('stops loading when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('userId')).toHaveTextContent('null')
    expect(single).not.toHaveBeenCalled()
  })

  it('propagates returned sign-out errors and allows a successful retry', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    signOut.mockResolvedValueOnce({ error: { message: 'network error' } })
      .mockResolvedValueOnce({ error: null })
    renderProvider()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'logout' }))
    expect(screen.getByTestId('result')).toHaveTextContent('error')
    await user.click(screen.getByRole('button', { name: 'logout' }))
    expect(screen.getByTestId('result')).toHaveTextContent('success')
  })

  it('propagates refresh errors instead of reporting a successful save', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    single.mockResolvedValueOnce({ data: { display_name: 'たろう' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'network error' } })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('たろう'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'refresh' }))
    expect(screen.getByTestId('result')).toHaveTextContent('error')
    expect(screen.getByTestId('profile')).toHaveTextContent('null')
  })

  it('settles initial loading when the profile request rejects', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    single.mockRejectedValueOnce(new Error('network error'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('userId')).toHaveTextContent('user-1')
    expect(screen.getByTestId('profile')).toHaveTextContent('null')
    expect(errorSpy).toHaveBeenCalled()
  })
})
