import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
const { profile, saveProfile, saveDotsSettings } = vi.hoisted(() => ({ profile: vi.fn(), saveProfile: vi.fn(), saveDotsSettings: vi.fn() }))
vi.mock('./queries', async original => ({ ...await original<typeof import('./queries')>(), profile, saveProfile, saveDotsSettings }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me', profile: { display_name: '自分' } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
import { RankingParticipation } from './RankingParticipation'
const mine = { user_id: 'me', display_name: '自分', icon: 'target', bio: '目標', global_ranking: false, dots_opt_in: false, dots_formula: null }
beforeEach(() => {
  vi.clearAllMocks()
  profile.mockResolvedValue(mine)
  saveProfile.mockResolvedValue(undefined)
  saveDotsSettings.mockResolvedValue(undefined)
})
const show = (mode: 'total' | 'dots' = 'total', global = true) => {
  const onJoined = vi.fn()
  render(<MemoryRouter><RankingParticipation mode={mode} global={global} onJoined={onJoined}><button>参加者の順位</button></RankingParticipation></MemoryRouter>)
  return onJoined
}
it('saves global consent only after disclosure and preserves the current profile', async () => {
  const onJoined = show()
  await userEvent.click(await screen.findByRole('button', { name: '公開して参加する' }))
  expect(screen.getByText(/全トレーニング履歴やセットのメモは公開されません/)).toBeInTheDocument()
  expect(saveProfile).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '参加者の順位' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '公開に同意して参加する' }))
  expect(saveProfile).toHaveBeenCalledWith({ ...mine, global_ranking: true })
  expect(saveDotsSettings).not.toHaveBeenCalled()
  expect(onJoined).toHaveBeenCalledOnce()
  expect(await screen.findByRole('button', { name: '参加者の順位' })).toBeInTheDocument()
})
it('requires explicit formula selection and saves both settings for global DOTS', async () => {
  show('dots')
  await userEvent.click(await screen.findByRole('button', { name: '係数を選んで参加する' }))
  expect(screen.getByText(/体重の公開にも同意/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '公開に同意して参加する' })).toBeDisabled()
  await userEvent.click(screen.getByRole('radio', { name: '女性用' }))
  await userEvent.click(screen.getByRole('button', { name: '公開に同意して参加する' }))
  expect(saveProfile).toHaveBeenCalledWith({ ...mine, global_ranking: true })
  expect(saveDotsSettings).toHaveBeenCalledWith(true, 'female')
})
it('joining community DOTS does not opt the user into global ranking', async () => {
  show('dots', false)
  await userEvent.click(await screen.findByRole('button', { name: '係数を選んで参加する' }))
  await userEvent.click(screen.getByRole('radio', { name: '男性用' }))
  await userEvent.click(screen.getByRole('button', { name: '公開に同意して参加する' }))
  expect(saveProfile).not.toHaveBeenCalled()
  expect(saveDotsSettings).toHaveBeenCalledWith(true, 'male')
})
it('keeps partial success accurate and retries only failed DOTS consent', async () => {
  saveDotsSettings.mockRejectedValueOnce(new Error('通信エラー'))
  show('dots')
  await userEvent.click(await screen.findByRole('button', { name: '係数を選んで参加する' }))
  await userEvent.click(screen.getByRole('radio', { name: '男性用' }))
  await userEvent.click(screen.getByRole('button', { name: '公開に同意して参加する' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '参加者の順位' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '公開に同意して参加する' }))
  expect(saveProfile).toHaveBeenCalledOnce()
  expect(saveDotsSettings).toHaveBeenCalledTimes(2)
})
it('does not write on dismissal or interpret a profile read failure as nonparticipation', async () => {
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'あとで' }))
  expect(saveProfile).not.toHaveBeenCalled()
  expect(await screen.findByRole('button', { name: 'ランキングに参加する' })).toBeInTheDocument()
})
it('offers retry when consent settings cannot be loaded', async () => {
  profile.mockRejectedValueOnce(new Error('通信エラー'))
  show()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '公開して参加する' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '参加設定を再試行' }))
  expect(await screen.findByRole('button', { name: '公開して参加する' })).toBeInTheDocument()
})
