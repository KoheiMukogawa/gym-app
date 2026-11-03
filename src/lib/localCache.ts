/**
 * 前回読み込んだ結果を端末に残し、次に開いたときにすぐ出すための保存場所（ユーザーごと）。
 * 表示した後に必ずサーバーから読み直して差し替えるので、ここに残るのは「すぐに見せる下書き」だけ。
 * 保存場所が使えない（プライベートモード・容量超過）ときは、何もしない。
 */
const PREFIX = 'glog:cache:'
// 形を変えたら上げる。古い形の保存は読まない
const VERSION = 1

const keyOf = (userId: string, name: string) => `${PREFIX}${userId}:${name}`

export function readCache<T>(userId: string | null, name: string, isValid: (value: unknown) => value is T): T | undefined {
  if (!userId) return undefined
  try {
    const raw = localStorage.getItem(keyOf(userId, name))
    if (raw === null) return undefined
    const stored = JSON.parse(raw) as { v?: unknown; value?: unknown }
    return stored.v === VERSION && isValid(stored.value) ? stored.value : undefined
  } catch {
    return undefined
  }
}

export function writeCache(userId: string | null, name: string, value: unknown): void {
  if (!userId) return
  try {
    localStorage.setItem(keyOf(userId, name), JSON.stringify({ v: VERSION, value }))
  } catch {
    // 残せなくても、次はサーバーから読むだけ
  }
}

/** 名前が条件に合う保存を消す。userId を省くと全員分 */
export function removeCache(match: (name: string) => boolean, userId?: string): void {
  try {
    const prefix = userId ? `${PREFIX}${userId}:` : PREFIX
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      // userId を省いたときは、ユーザーIDの後ろの名前で比べる
      const name = key.slice(prefix.length).replace(userId ? '' : /^[^:]*:/, '')
      if (match(name)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // 消せなくても、表示したあとに読み直す
  }
}

/** ログアウトしたら、その人の記録を端末に残さない */
export function clearUserCache(userId: string): void {
  removeCache(() => true, userId)
}

export const isArray = (value: unknown): value is never[] => Array.isArray(value)
