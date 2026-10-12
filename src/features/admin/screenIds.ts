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

/** 記録画面は種目を選ぶ前（REC-01）と後（REC-02）で同じURLなので、選択中かどうかを受け取る。 */
export function screenIdFor(pathname: string, pickingExercise: boolean): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/log') return pickingExercise ? 'REC-01' : 'REC-02'
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
