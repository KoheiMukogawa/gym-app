import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Member } from './queries'

const { rpc, demo } = vi.hoisted(() => ({ rpc: vi.fn(), demo: { value: false } }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('../../lib/demoMode', async (original) => ({
  ...await original<typeof import('../../lib/demoMode')>(),
  get IS_DEMO() { return demo.value },
}))
import { MemberDetail } from './MemberDetail'

// jsdom has no modal dialog
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})

const member = (user_id: string, display_name: string): Member => ({
  user_id, display_name, icon: 'initials', bio: '', total: 500, growth: null, dots: null, dots_opt_in: false,
  lifts: { squat: 200, bench: 120, deadlift: 180 }, points: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  demo.value = false
  rpc.mockResolvedValue({ data: null, error: null })
})

describe('MemberDetail', () => {
  it('offers report and block for other people, but not for oneself or in the landing demo', () => {
    const { unmount } = render(<MemberDetail member={member('a', '太郎')} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '通報する' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ブロックする' })).toBeInTheDocument()
    unmount()

    const self = render(<MemberDetail member={member('me', '自分')} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '通報する' })).not.toBeInTheDocument()
    self.unmount()

    demo.value = true
    render(<MemberDetail member={member('a', '太郎')} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '通報する' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ブロックする' })).not.toBeInTheDocument()
  })

  it('reports with a reason and detail, then offers to block the same person', async () => {
    const onClose = vi.fn(), onBlocked = vi.fn()
    render(<MemberDetail member={member('a', '太郎')} onClose={onClose} onBlocked={onBlocked} />)
    await userEvent.click(screen.getByRole('button', { name: '通報する' }))
    const send = screen.getByRole('button', { name: '通報する' })
    expect(send).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: '不適切な画像' }))
    await userEvent.type(screen.getByRole('textbox', { name: '詳しい内容（任意）' }), '  アイコンが不快 ')
    await userEvent.click(send)
    expect(rpc).toHaveBeenCalledWith('report_user', { p_target: 'a', p_reason: 'photo', p_detail: 'アイコンが不快' })
    expect(await screen.findByText('通報しました。運営が確認します。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'この人をブロックする' }))
    expect(screen.getByText('太郎さんをブロックしますか？')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ブロックする' }))
    expect(rpc).toHaveBeenLastCalledWith('block_user', { p_target: 'a' })
    expect(onBlocked).toHaveBeenCalledWith('a')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the form and shows the reason when the report is refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '通報の上限に達しました。時間をおいてお試しください' } })
    render(<MemberDetail member={member('a', '太郎')} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '通報する' }))
    await userEvent.click(screen.getByRole('radio', { name: 'その他' }))
    await userEvent.click(screen.getByRole('button', { name: '通報する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('通報の上限に達しました')
    expect(screen.getByRole('radio', { name: 'その他' })).toBeChecked()
  })

  it('does not report the blocked person as blocked when blocking fails', async () => {
    const onBlocked = vi.fn(), onClose = vi.fn()
    rpc.mockResolvedValue({ data: null, error: { message: 'この操作はできません' } })
    render(<MemberDetail member={member('a', '太郎')} onClose={onClose} onBlocked={onBlocked} />)
    await userEvent.click(screen.getByRole('button', { name: 'ブロックする' }))
    await userEvent.click(screen.getByRole('button', { name: 'ブロックする' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('この操作はできません')
    expect(onBlocked).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
