import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
vi.mock('../../lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('./SessionProvider', () => ({ useSession: () => ({ userId: null, loading: false }) }))
import { LoginPage } from './LoginPage'
import { LandingPage } from './LandingPage'

const renderIn = (page: React.ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>)

describe('links to the legal pages', () => {
  it('tells people signing up what they agree to', () => {
    renderIn(<LoginPage signup />)
    expect(screen.getByText(/に同意したものとみなします/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy')
  })
  it('does not repeat the agreement on the login form', () => {
    renderIn(<LoginPage />)
    expect(screen.queryByText(/に同意したものとみなします/)).not.toBeInTheDocument()
  })
  it('links both pages from the introduction', () => {
    renderIn(<LandingPage />)
    expect(screen.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy')
  })
})
