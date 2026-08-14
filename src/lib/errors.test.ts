import { describe, it, expect, vi } from 'vitest'
import { toMessage } from './errors'

describe('toMessage', () => {
  it('reports a network failure in plain language', () => {
    expect(toMessage(new TypeError('Failed to fetch')))
      .toBe('通信できませんでした。電波を確認して、もう一度お試しください。')
  })

  it('maps invalid credentials to a login-specific message', () => {
    expect(toMessage({ message: 'Invalid login credentials' }))
      .toBe('メールアドレスまたはパスワードが違います。')
  })

  it('maps a unique constraint violation on exercises', () => {
    expect(toMessage({ code: '23505', message: 'duplicate key value' }))
      .toBe('同じ名前の種目がすでに登録されています。')
  })

  it('falls back to a generic message for unknown errors', () => {
    expect(toMessage(new Error('boom')))
      .toBe('エラーが発生しました。もう一度お試しください。')
  })

  it('maps a unique constraint violation even when navigator.onLine is false', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      expect(toMessage({ code: '23505', message: 'duplicate key value' }))
        .toBe('同じ名前の種目がすでに登録されています。')
    } finally {
      spy.mockRestore()
    }
  })
})
