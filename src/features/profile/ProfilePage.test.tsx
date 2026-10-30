import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
const { rpc, profile, refreshProfile } = vi.hoisted(() => ({ rpc: vi.fn(), profile: vi.fn(), refreshProfile: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me', profile: { display_name: '自分' }, refreshProfile }) }))
vi.mock('../community/queries', async (original) => ({ ...await original<typeof import('../community/queries')>(), profile }))
vi.mock('../feedback/queries', () => ({ fetchIsAdmin: vi.fn().mockResolvedValue(false), fetchUnreadFeedbackCount: vi.fn() }))
const photo = vi.hoisted(() => ({ prepareImage: vi.fn(), cropAvatar: vi.fn(), uploadPhoto: vi.fn(), removePhoto: vi.fn() }))
// jsdom does not implement the modal top layer.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})
const prepared = { canvas: { toBlob: (done: (blob: Blob) => void) => done(new Blob(['p'], { type: 'image/jpeg' })) }, width: 800, height: 400 }
vi.mock('./photo', async (original) => ({ ...await original<typeof import('./photo')>(), ...photo }))
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
  expect(screen.getByText(/スコアから体重を推定できる場合/)).toBeInTheDocument()
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

it('links to account deletion at the bottom', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  renderPage()
  expect(await screen.findByRole('link', { name: '退会する' })).toHaveAttribute('href', '/account/delete')
})

it('groups profile, ranking and app settings into clear sections', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  renderPage()
  expect(await screen.findByRole('region', { name: 'プロフィール設定' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '基本情報' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '公開とランキング' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'アプリ設定' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'アカウント' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '利用規約' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'プライバシーポリシー' })).not.toBeInTheDocument()
})

it('does not duplicate app-wide support links', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  renderPage()
  await screen.findByRole('heading', { name: '基本情報' })
  expect(screen.queryByRole('link', { name: /ご意見・不具合/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '体組成を記録する →' })).not.toBeInTheDocument()
})

it('uploads a chosen photo on save, uses it as the icon and removes the old photo', async () => {
  const old = 'photo:me/00000000-0000-4000-8000-000000000001.webp'
  const next = 'photo:me/00000000-0000-4000-8000-000000000002.webp'
  profile.mockResolvedValue({ ...base, icon: old, dots_opt_in: false, dots_formula: null })
  const image = new Blob(['x'], { type: 'image/webp' })
  photo.prepareImage.mockResolvedValue(prepared)
  photo.cropAvatar.mockResolvedValue(image)
  photo.uploadPhoto.mockResolvedValue(next)
  photo.removePhoto.mockResolvedValue(undefined)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  const { container } = renderPage()
  expect(await screen.findByRole('button', { name: '写真を選び直す' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['raw'], 'me.heic', { type: 'image/heic' }))
  // The cropper opens on the centered square; confirming crops that range.
  expect(await screen.findByRole('dialog', { name: '写真の範囲を選ぶ' })).toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'この範囲にする' }))
  expect(photo.cropAvatar).toHaveBeenCalledWith(prepared, { x: 200, y: 0, size: 400 })
  expect(screen.queryByRole('dialog', { name: '写真の範囲を選ぶ' })).not.toBeInTheDocument()
  expect(photo.uploadPhoto).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
  expect(await screen.findByRole('status')).toHaveTextContent('保存しました')
  expect(photo.uploadPhoto).toHaveBeenCalledWith('me', image)
  expect(rpc).toHaveBeenCalledWith('save_glog_profile', expect.objectContaining({ p_icon: next }))
  expect(photo.removePhoto).toHaveBeenCalledWith(old)
})

it('removes the uploaded photo when saving the profile fails', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  photo.prepareImage.mockResolvedValue(prepared)
  photo.cropAvatar.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
  photo.uploadPhoto.mockResolvedValue('photo:me/00000000-0000-4000-8000-000000000003.jpg')
  photo.removePhoto.mockResolvedValue(undefined)
  rpc.mockResolvedValueOnce({ error: { message: 'network' } })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  const { container } = renderPage()
  await screen.findByRole('button', { name: '写真を選ぶ' })
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['raw'], 'me.jpg', { type: 'image/jpeg' }))
  await userEvent.click(await screen.findByRole('button', { name: 'この範囲にする' }))
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(photo.removePhoto).toHaveBeenCalledWith('photo:me/00000000-0000-4000-8000-000000000003.jpg')
})

it('leaves the icon as it was when the cropper is closed', async () => {
  profile.mockResolvedValue({ ...base, icon: 'barbell', dots_opt_in: false, dots_formula: null })
  photo.prepareImage.mockResolvedValue(prepared)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  const { container } = renderPage()
  await screen.findByRole('button', { name: '写真を選ぶ' })
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['raw'], 'me.jpg', { type: 'image/jpeg' }))
  await userEvent.click(await screen.findByRole('button', { name: '閉じる' }))
  expect(screen.getByRole('button', { name: 'バーベル' })).toHaveAttribute('aria-pressed', 'true')
  expect(photo.cropAvatar).not.toHaveBeenCalled()
})
