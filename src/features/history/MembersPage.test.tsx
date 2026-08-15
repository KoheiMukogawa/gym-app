import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import { MembersPage } from './MembersPage'

const { fetchProfiles } = vi.hoisted(() => ({ fetchProfiles: vi.fn() }))
vi.mock('./queries', () => ({ fetchProfiles }))

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <MembersPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('MembersPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders each member as a link to their history', async () => {
    fetchProfiles.mockResolvedValueOnce([
      { id: 'u1', display_name: 'あき', created_at: '2026-08-01T00:00:00Z' },
    ])
    renderPage()

    const link = await screen.findByRole('link', { name: 'あき' })
    expect(link).toHaveAttribute('href', '/members/u1')
  })

  it('shows an explicit empty state', async () => {
    fetchProfiles.mockResolvedValueOnce([])
    renderPage()
    expect(await screen.findByText('メンバーがいません')).toBeInTheDocument()
  })

  it('retries after a fetch failure', async () => {
    fetchProfiles.mockRejectedValueOnce(new Error('network error'))
    fetchProfiles.mockResolvedValueOnce([])
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '再試行' }))
    expect(await screen.findByText('メンバーがいません')).toBeInTheDocument()
    expect(fetchProfiles).toHaveBeenCalledTimes(2)
  })
})
