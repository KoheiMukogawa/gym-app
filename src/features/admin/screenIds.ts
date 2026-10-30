// 画面ID（docs/screens.md）のうち、ヘッダーのある画面の分。
// 要望や不具合を「REC-02 のダイヤル」のように伝えるため、管理者にだけヘッダーへ出す。
const EXACT: Record<string, string> = {
  '/': 'HOME-01',
  '/history': 'HIS-01',
  '/history/new': 'HIS-03',
  '/big3': 'BIG-01',
  '/big3/start': 'BIG-02',
  '/ranking': 'RANK-01',
  '/body': 'BODY-01',
  '/profile': 'PROFILE-01',
  '/export': 'EXPORT-01',
  '/feedback': 'FEEDBACK-01',
  '/account/delete': 'ACCOUNT-01',
  '/admin/feedback': 'ADMIN-01',
  '/admin/usage': 'ADMIN-02',
}

/**
 * 記録画面で今出している画面。どれも同じURL（/log）なので、記録画面から受け取る。
 * ダイヤル：種目選択 REC-01・記録入力 REC-02。一覧：今日の記録 REC-03・種目を選択 REC-04・記録入力 REC-05。
 */
export type LogScreen = 'REC-01' | 'REC-02' | 'REC-03' | 'REC-04' | 'REC-05'

export function logScreenFor(mode: 'dial' | 'list', picking: boolean, choosingExercise: boolean): LogScreen {
  if (mode === 'dial') return picking ? 'REC-01' : 'REC-02'
  return picking ? (choosingExercise ? 'REC-04' : 'REC-03') : 'REC-05'
}

export function screenIdFor(pathname: string, logScreen: LogScreen): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/log') return logScreen
  if (EXACT[path]) return EXACT[path]
  if (/^\/history\/[^/]+$/.test(path)) return 'HIS-02'
  if (/^\/exercises\/[^/]+$/.test(path)) return 'EX-01'
  return null
}

const STORAGE_KEY = 'glog:show-screen-ids'

export function loadShowScreenIds(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export function saveShowScreenIds(show: boolean) {
  try { if (show) localStorage.setItem(STORAGE_KEY, '1'); else localStorage.removeItem(STORAGE_KEY) } catch { /* 保存できなくても今の表示は切り替わる */ }
}
