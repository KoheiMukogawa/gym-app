const NETWORK = '通信できませんでした。電波を確認して、もう一度お試しください。'
const GENERIC = 'エラーが発生しました。もう一度お試しください。'

type ErrorLike = { message?: string; code?: string }

export function toMessage(error: unknown): string {
  const e = (error ?? {}) as ErrorLike

  if (e.code === '23505') return '同じ名前の種目がすでに登録されています。'
  if (e.message === 'Invalid login credentials') {
    return 'メールアドレスまたはパスワードが違います。'
  }
  if (error instanceof TypeError && /fetch/i.test(e.message ?? '')) return NETWORK
  if (!navigator.onLine) return NETWORK
  return GENERIC
}

export function isOffline(): boolean {
  return !navigator.onLine
}
