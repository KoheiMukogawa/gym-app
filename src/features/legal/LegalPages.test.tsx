import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPage, TermsPage } from './LegalPages'

const renderIn = (page: React.ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>)

describe('legal pages', () => {
  it('shows the privacy policy with its sections, table and contact', () => {
    renderIn(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '5. 外部サービスの利用' })).toBeInTheDocument()
    expect(screen.getByText('アカウントの情報', { selector: 'strong' })).toBeInTheDocument()
    const services = screen.getAllByRole('table')[1]
    expect(within(services).getByRole('columnheader', { name: '情報の保存場所' })).toBeInTheDocument()
    expect(within(services).getByRole('cell', { name: '日本（東京リージョン）' })).toBeInTheDocument()
    expect(screen.getAllByText(/glog\.app\.help@gmail\.com/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Glog トップへ' })).toHaveAttribute('href', '/')
  })

  it('shows the terms with numbered rules', () => {
    renderIn(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: '利用規約' })).toBeInTheDocument()
    expect(screen.getByText('法令または公序良俗に反する行為').closest('ol')).not.toBeNull()
    expect(screen.getByText(/京都地方裁判所/)).toBeInTheDocument()
  })
})
