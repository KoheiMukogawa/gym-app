import { expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
vi.mock('../strength/StrengthPage', () => ({ StrengthPage: () => <p>自分のBIG3</p> }))
vi.mock('./CommunityPanel', () => ({ CommunityPanel: () => <p>ランキングの中身</p> }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'u1', profile: null, refreshProfile: vi.fn(), signOut: vi.fn() }) }))
vi.mock('../workout-log/LogPage', () => ({ LogPage: () => null }))
import { AppShell } from '../../components/AppShell'
import { Big3Page } from './Big3Page'
import { RankingPage } from './RankingPage'

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route element={<AppShell />}>
    <Route path="/big3" element={<Big3Page />} />
    <Route path="/ranking" element={<RankingPage />} />
  </Route>
</Routes></MemoryRouter>)

it('shows only the own BIG3 records, without a self/ranking switch', () => {
  renderAt('/big3')
  expect(screen.getByText('自分のBIG3')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'BIG3の表示' })).not.toBeInTheDocument()
  expect(screen.queryByText('ランキングの中身')).not.toBeInTheDocument()
})

it('gives the ranking its own bottom tab and page', () => {
  renderAt('/ranking')
  const nav = screen.getByRole('navigation', { name: 'メイン' })
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['ホーム', '履歴', 'BIG3', 'ランキング', '体組成'])
  expect(within(nav).getByRole('link', { name: 'ランキング' })).toHaveAttribute('href', '/ranking')
  expect(screen.getByRole('heading', { name: 'ランキング' })).toBeInTheDocument()
  expect(screen.getByText('ランキングの中身')).toBeInTheDocument()
})

it('sends the old ranking address to the ranking page', () => {
  renderAt('/big3?view=ranking')
  expect(screen.getByText('ランキングの中身')).toBeInTheDocument()
  expect(screen.queryByText('自分のBIG3')).not.toBeInTheDocument()
})
