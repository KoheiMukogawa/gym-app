import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { fetchIsAdmin, fetchUnreadFeedbackCount } = vi.hoisted(() => ({ fetchIsAdmin: vi.fn(), fetchUnreadFeedbackCount: vi.fn() }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('./queries', () => ({ fetchIsAdmin, fetchUnreadFeedbackCount }))
import { FeedbackLinks } from './FeedbackLinks'

const renderLinks = async () => {
  render(<MemoryRouter><FeedbackLinks /></MemoryRouter>)
  await act(async () => {})
}
beforeEach(() => vi.clearAllMocks())

it('links everyone to the form and hides the admin entry from users', async () => {
  fetchIsAdmin.mockResolvedValue(false)
  await renderLinks()
  expect(screen.getByRole('link', { name: 'ご意見・不具合を送る →' })).toHaveAttribute('href', '/feedback')
  expect(screen.queryByRole('link', { name: /届いた意見/ })).not.toBeInTheDocument()
  expect(fetchIsAdmin).toHaveBeenCalledWith('me')
  expect(fetchUnreadFeedbackCount).not.toHaveBeenCalled()
})

it('shows admins the list with the new count', async () => {
  fetchIsAdmin.mockResolvedValue(true)
  fetchUnreadFeedbackCount.mockResolvedValue(3)
  await renderLinks()
  expect(screen.getByRole('link', { name: /届いた意見/ })).toHaveAttribute('href', '/admin/feedback')
  expect(screen.getByText('新着 3')).toBeInTheDocument()
})

it('shows admins the list without a badge when nothing is new', async () => {
  fetchIsAdmin.mockResolvedValue(true)
  fetchUnreadFeedbackCount.mockResolvedValue(0)
  await renderLinks()
  expect(screen.getByRole('link', { name: /届いた意見/ })).toBeInTheDocument()
  expect(screen.queryByText(/新着/)).not.toBeInTheDocument()
})

it('leaves out the admin entry when the check fails', async () => {
  fetchIsAdmin.mockRejectedValue(new Error('offline'))
  await renderLinks()
  expect(screen.getByRole('link', { name: 'ご意見・不具合を送る →' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /届いた意見/ })).not.toBeInTheDocument()
})
