const NETWORK = '通信できませんでした。電波を確認して、もう一度お試しください。'
const GENERIC = 'エラーが発生しました。もう一度お試しください。'

type ErrorLike = { message?: string; code?: string }

/** Only locally authored validation messages are shown verbatim. */
export class InputError extends Error {}

/** A request that did not answer in time, as on a weak gym signal. */
export class TimeoutError extends Error {}

/**
 * fetch itself failed: no signal, or the connection dropped. supabase-js does not throw here; it returns
 * an error whose message is the fetch error's, such as "TypeError: Failed to fetch" (Chrome) or
 * "TypeError: Load failed" (Safari).
 */
function isFetchFailure(error: unknown): boolean {
  const FAILED = /fetch|load failed|network/i
  if (error instanceof TypeError) return FAILED.test(error.message)
  const message = (error as ErrorLike | null)?.message ?? ''
  return /^(TypeError|FetchError): /.test(message) && FAILED.test(message)
}

/** True when the request failed for lack of a connection, so it can be sent again later. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TimeoutError || isFetchFailure(error)) return true
  return !navigator.onLine
}

export function toMessage(error: unknown): string {
  if (error instanceof InputError) return error.message
  const e = (error ?? {}) as ErrorLike

  if (e.code === '23505') return '同じ名前の種目がすでに登録されています。'
  if (e.code === 'captcha_failed') return 'ボットではないことの確認に失敗しました。もう一度お試しください。'
  if (e.code === 'over_email_send_rate_limit') return 'メールの送信回数が上限に達しました。しばらく待ってからお試しください。'
  if (e.code === 'same_password') return '今のパスワードとは別のパスワードを入力してください。'
  if (e.code === 'weak_password') return 'パスワードが短すぎるか、推測されやすいものです。別のパスワードを入力してください。'
  if (e.message === 'Invalid login credentials') {
    return 'メールアドレスまたはパスワードが違います。'
  }
  if (error instanceof TimeoutError || isFetchFailure(error)) return NETWORK
  if (!navigator.onLine) return NETWORK
  return GENERIC
}

export function isOffline(): boolean {
  return !navigator.onLine
}

// Reasons raised by the admin and feedback database functions are written for the user.
const ADMIN_REASONS = ['ログインが必要です', '権限がありません', '送信の上限に達しました。時間をおいてお試しください', '状態を選んでください', '返信は1000文字までです', '意見が見つかりません', '操作を選んでください', '未対応の通報が見つかりません']

export function adminMessage(error: unknown): string {
  const e = (error ?? {}) as ErrorLike
  if (e.code === 'PGRST202' || e.code === 'PGRST205') return 'この機能の準備中です。時間をおいてお試しください。'
  return ADMIN_REASONS.includes(e.message ?? '') ? e.message! : toMessage(error)
}
