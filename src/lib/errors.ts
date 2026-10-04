const NETWORK = '通信できませんでした。電波を確認して、もう一度お試しください。'
const GENERIC = 'エラーが発生しました。もう一度お試しください。'

type ErrorLike = { message?: string; code?: string }

/** Only locally authored validation messages are shown verbatim. */
export class InputError extends Error {}

export function toMessage(error: unknown): string {
  if (error instanceof InputError) return error.message
  const e = (error ?? {}) as ErrorLike

  if (e.code === '23505') return '同じ名前の種目がすでに登録されています。'
  if (e.code === 'over_email_send_rate_limit') return 'メールの送信回数が上限に達しました。しばらく待ってからお試しください。'
  if (e.code === 'same_password') return '今のパスワードとは別のパスワードを入力してください。'
  if (e.code === 'weak_password') return 'パスワードが短すぎるか、推測されやすいものです。別のパスワードを入力してください。'
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
