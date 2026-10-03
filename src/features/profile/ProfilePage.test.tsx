import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
const { rpc, profile, refreshProfile } = vi.hoisted(() => ({ rpc: vi.fn(), profile: vi.fn(), refreshProfile: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me', profile: { display_name: '自分' }, refreshProfile }) }))
vi.mock('../community/queries', async (original) => ({ ...await original<typeof import('../community/queries')>(), profile }))
import { ProfilePage } from './ProfilePage'

const base = { user_id: 'me', display_name: '自分', icon: 'initials', bio: '', global_ranking: true }
const renderPage = () => render(<MemoryRouter><ProfilePage /></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ error: null })
  refreshProfile.mockResolvedValue(undefined)
})

it('requires a formula before opting in, then saves profile and DOTS settings', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  renderPage()
  await userEvent.click(await screen.findByRole('checkbox', { name: 'DOTSランキングに参加する' }))
  expect(screen.getByRole('button', { name: 'プロフィールを保存' })).toBeDisabled()
  expect(screen.getByText('保存するには係数を選んでください。')).toBeInTheDocument()
  expect(screen.getByText(/体重の公開に同意したことになります/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: '女性用' }))
  expect(screen.queryByText('保存するには係数を選んでください。')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
  expect(await screen.findByRole('status')).toHaveTextContent('保存しました')
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(['save_glog_profile', 'save_dots_settings'])
  expect(rpc).toHaveBeenLastCalledWith('save_dots_settings', { p_opt_in: true, p_formula: 'female' })
})

it('saves only the profile when the DOTS settings are unchanged', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'プロフィールを保存' }))
  expect(await screen.findByRole('status')).toHaveTextContent('保存しました')
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(['save_glog_profile'])
})

it('loads an existing choice and keeps the formula when opting out', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: true, dots_formula: 'male' })
  renderPage()
  expect(await screen.findByRole('radio', { name: '男性用' })).toBeChecked()
  await userEvent.click(screen.getByRole('checkbox', { name: 'DOTSランキングに参加する' }))
  expect(screen.queryByRole('radio', { name: '男性用' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
  await screen.findByRole('status')
  expect(rpc).toHaveBeenLastCalledWith('save_dots_settings', { p_opt_in: false, p_formula: 'male' })
})

it('keeps the error on screen when only the DOTS settings fail to save', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: true, dots_formula: 'male' })
  rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'DOTSの係数を選んでください' } })
  renderPage()
  await userEvent.click(await screen.findByRole('radio', { name: '女性用' }))
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('DOTSの係数を選んでください')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
