import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'

const { rpc, signOut, clearDraft } = vi.hoisted(() => ({ rpc: vi.fn(), signOut: vi.fn(), clearDraft: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc, auth: { signOut } } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('../workout-log/persistence', () => ({ clearDraft }))
import { DeleteAccountPage } from './DeleteAccountPage'

const summary = { workout_days: 42, set_count: 380, body_log_count: 15, custom_exercise_count: 2, health_sync_connected: false, owned_communities: [] as { name: string; other_member_count: number }[] }
function mockRpc(overrides: Partial<typeof summary> = {}) {
  rpc.mockImplementation(async (name: string) => name === 'account_deletion_summary'
    ? { data: { ...summary, ...overrides }, error: null } : { data: null, error: null })
}
function renderPage() {
  return render(<MemoryRouter initialEntries={['/account/delete']}><ToastProvider><Routes>
    <Route path="/account/delete" element={<DeleteAccountPage />} />
    <Route path="/" element={<p>紹介ページ</p>} />
  </Routes></ToastProvider></MemoryRouter>)
}
const deletionCalls = () => rpc.mock.calls.filter(([name]) => name === 'delete_my_account')

beforeEach(() => {
  vi.clearAllMocks()
  signOut.mockResolvedValue({ error: null })
  mockRpc()
})

describe('DeleteAccountPage', () => {
  it('lists what will be deleted and links to the export first', async () => {
    renderPage()
    expect(await screen.findByText('記録 42日分（380セット）')).toBeInTheDocument()
    expect(screen.getByText('体組成 15件')).toBeInTheDocument()
    expect(screen.getByText('自作の種目 2件')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '退会前に記録を書き出す' })).toHaveAttribute('href', '/export')
    expect(screen.queryByText(/ショートカット/)).not.toBeInTheDocument()
  })

  it('warns about every owned community, including one without other members', async () => {
    mockRpc({ owned_communities: [{ name: '朝トレ部', other_member_count: 3 }, { name: 'ひとり部', other_member_count: 0 }] })
    renderPage()
    expect(await screen.findByText('あなたが作成したコミュニティ「朝トレ部」も削除され、ほかのメンバー3人の画面から消えます。')).toBeInTheDocument()
    expect(screen.getByText('あなたが作成したコミュニティ「ひとり部」も削除され、ほかのメンバー0人の画面から消えます。')).toBeInTheDocument()
  })

  it('reminds Health sync users to remove the shortcut', async () => {
    mockRpc({ health_sync_connected: true })
    renderPage()
    expect(await screen.findByText('iPhoneのショートカットは自動では消えません。ショートカットAppから削除してください。')).toBeInTheDocument()
  })

  it('enables the button only for the exact confirmation text', async () => {
    renderPage()
    const input = await screen.findByLabelText('確認のため「退会する」と入力してください')
    const button = screen.getByRole('button', { name: '退会する' })
    for (const text of ['退会', ' 退会する', '退会する ']) {
      await userEvent.clear(input)
      await userEvent.type(input, text)
      expect(button).toBeDisabled()
    }
    await userEvent.clear(input)
    await userEvent.type(input, '退会する')
    expect(button).toBeEnabled()
  })

  it('deletes once, clears this device, and returns to the introduction', async () => {
    let finish: (value: { data: null; error: null }) => void = () => {}
    rpc.mockImplementation((name: string) => name === 'account_deletion_summary'
      ? Promise.resolve({ data: summary, error: null })
      : new Promise((resolve) => { finish = resolve }))
    renderPage()
    await userEvent.type(await screen.findByLabelText('確認のため「退会する」と入力してください'), '退会する')
    await userEvent.click(screen.getByRole('button', { name: '退会する' }))
    expect(screen.getByRole('button', { name: '退会処理中…' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '退会処理中…' }))
    finish({ data: null, error: null })
    expect(await screen.findByText('紹介ページ')).toBeInTheDocument()
    expect(screen.getByText('退会しました')).toBeInTheDocument()
    expect(deletionCalls()).toEqual([['delete_my_account', { p_confirm: '退会する' }]])
    expect(clearDraft).toHaveBeenCalledWith('me')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('still signs this device out when the page is left while the deletion is running', async () => {
    let finish: (value: { data: null; error: null }) => void = () => {}
    rpc.mockImplementation((name: string) => name === 'account_deletion_summary'
      ? Promise.resolve({ data: summary, error: null })
      : new Promise((resolve) => { finish = resolve }))
    const { unmount } = renderPage()
    await userEvent.type(await screen.findByLabelText('確認のため「退会する」と入力してください'), '退会する')
    await userEvent.click(screen.getByRole('button', { name: '退会する' }))
    unmount()
    finish({ data: null, error: null })
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }))
    expect(clearDraft).toHaveBeenCalledWith('me')
  })

  it('keeps the input and explains a failed deletion', async () => {
    rpc.mockImplementation(async (name: string) => name === 'account_deletion_summary'
      ? { data: summary, error: null }
      : { data: null, error: { message: 'ほかの利用者の記録が使っている種目があるため退会できません' } })
    renderPage()
    const input = await screen.findByLabelText('確認のため「退会する」と入力してください')
    await userEvent.type(input, '退会する')
    await userEvent.click(screen.getByRole('button', { name: '退会する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ほかの利用者の記録が使っている種目があるため退会できません')
    expect(input).toHaveValue('退会する')
    expect(screen.getByRole('button', { name: '退会する' })).toBeEnabled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('hides the deletion when the summary fails, and recovers on retry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new TypeError('Failed to fetch') })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('通信できませんでした')
    expect(screen.queryByRole('button', { name: '退会する' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('記録 42日分（380セット）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退会する' })).toBeInTheDocument()
  })
})
