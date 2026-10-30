import { useCallback, useEffect, useState } from 'react'

/** 記録画面の入力方法。dial は今までのダイヤル、list はセットを表の行で打つ一覧。 */
export type LogInputMode = 'dial' | 'list'

/**
 * 一覧入力を公開した時刻。これより後に登録した人には、最初の記録で入力方法を選んでもらう
 * （筋トレMemoなどから移ってきた人が、慣れた形を選べるように）。それより前の人はダイヤルのまま。
 */
export const LIST_MODE_RELEASED_AT = '2026-10-30T23:52:00+09:00'

const EVENT = 'glog-log-input-mode'

function keyFor(userId: string): string {
  return `glog:log-input-mode:${userId}`
}

export function loadInputMode(userId: string): LogInputMode | null {
  try {
    const value = localStorage.getItem(keyFor(userId))
    return value === 'dial' || value === 'list' ? value : null
  } catch {
    return null
  }
}

export function saveInputMode(userId: string, mode: LogInputMode): void {
  try {
    localStorage.setItem(keyFor(userId), mode)
  } catch {
    // 保存できない環境（プライベートモードなど）では、開いている間だけ切り替わる
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId, mode } }))
}

/** 公開より後に登録し、まだ選んでいない人に入力方法を聞く。 */
export function shouldAskInputMode(registeredAt: string | null | undefined, chosen: boolean): boolean {
  if (chosen || !registeredAt) return false
  return Date.parse(registeredAt) > Date.parse(LIST_MODE_RELEASED_AT)
}

/** 入力方法の設定。記録画面・メニュー・プロフィールのどこで変えても、ほかの画面にすぐ伝わる。 */
export function useLogInputMode(userId: string | null): { mode: LogInputMode; chosen: boolean; setMode: (mode: LogInputMode) => void } {
  const [stored, setStored] = useState<LogInputMode | null>(() => (userId ? loadInputMode(userId) : null))
  useEffect(() => {
    setStored(userId ? loadInputMode(userId) : null)
    const update = (e: Event) => {
      const detail = (e as CustomEvent<{ userId: string; mode: LogInputMode }>).detail
      if (detail.userId === userId) setStored(detail.mode)
    }
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [userId])
  const setMode = useCallback((mode: LogInputMode) => {
    if (userId) saveInputMode(userId, mode)
    else setStored(mode)
  }, [userId])
  return { mode: stored ?? 'dial', chosen: stored !== null, setMode }
}
