import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionProvider, useSession } from './SessionProvider'

const { getSession, onAuthStateChange, single } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  single: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signOut: vi.fn() },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  },
}))

function Probe() {
  const { userId, profile, loading } = useSession()
  return (
    <>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="userId">{userId ?? 'null'}</span>
      <span data-testid="profile">{profile?.display_name ?? 'null'}</span>
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

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('profile')).toHaveTextContent('たろう')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('stops loading when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('userId')).toHaveTextContent('null')
    expect(single).not.toHaveBeenCalled()
  })
})
