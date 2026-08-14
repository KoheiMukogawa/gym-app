const NETWORK = '通信できませんでした。電波を確認して、もう一度お試しください。'
const GENERIC = 'エラーが発生しました。もう一度お試しください。'

type ErrorLike = { message?: string; code?: string }

export function toMessage(error: unknown): string {
  if (!navigator.onLine) return NETWORK

  const e = (error ?? {}) as ErrorLike

  if (error instanceof TypeError && /fetch/i.test(e.message ?? '')) return NETWORK
  if (e.code === '23505') return '同じ名前の種目がすでに登録されています。'
  if (e.message === 'Invalid login credentials') {
    return 'メールアドレスまたはパスワードが違います。'
  }
  return GENERIC
}

export function isOffline(): boolean {
  return !navigator.onLine
}
