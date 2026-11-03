import { useEffect, useSyncExternalStore } from 'react'

/**
 * 起動時に自動で出すシート（ご意見への返信・ホーム画面に追加・投票・お知らせ）を、1回の起動で1枚までにする。
 * それぞれのシートは「確かめ中」「出したい」「出すものはない」を知らせ、出したいもののうち優先の高い1枚だけが出る。
 * 優先の高いシートを確かめている間は、低いシートを出さずに待つ（待つのは CHECK_LIMIT_MS まで）。
 * 出さなかったシートは次の起動で出る。ホーム画面のアプリはページを開いたまま何日も残るので、
 * 30分以上裏に回っていたあとに戻ったときも新しい起動として数える。
 * メニューから開くもの（ホーム画面に追加の案内など）はここを通さない。
 */
export type LaunchSheet = 'feedback-reply' | 'install' | 'poll' | 'announcements'
export type LaunchSheetStatus = 'checking' | 'wants' | 'none'

/**
 * 優先の高い順。返信は本人あて、ホーム画面に追加は登録の直後・最初の記録の後の今だけ、
 * 投票には締め切りがある。お知らせは次の起動でもよい。
 */
const PRIORITY: LaunchSheet[] = ['feedback-reply', 'install', 'poll', 'announcements']
/** 通信が遅い・失敗したときに、確かめ中のシートを待ち続けない */
const CHECK_LIMIT_MS = 4000
const NEW_LAUNCH_AFTER_MS = 30 * 60_000

const statuses = new Map<LaunchSheet, { status: LaunchSheetStatus; since: number }>()
let active: LaunchSheet | null = null
let used = false
let mounted = 0
let hiddenAt: number | null = null
let scheduled = false
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function settle() {
  scheduled = false
  if (timer) { clearTimeout(timer); timer = null }
  // 出していたシートが閉じた
  if (active && statuses.get(active)?.status !== 'wants') active = null
  if (!active && !used) {
    const now = Date.now()
    for (const kind of PRIORITY) {
      const entry = statuses.get(kind)
      if (!entry || entry.status === 'none') continue
      if (entry.status === 'checking') {
        const left = entry.since + CHECK_LIMIT_MS - now
        if (left > 0) { timer = setTimeout(settle, left); break }
        continue
      }
      active = kind
      used = true
      break
    }
  }
  listeners.forEach((listener) => listener())
}

// 同じ描画で知らせてきたシートがそろってから決める（先に知らせたシートが優先を飛び越えないように）
function schedule() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(settle)
}

function onVisibility() {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
  if (hiddenAt !== null && Date.now() - hiddenAt >= NEW_LAUNCH_AFTER_MS && !active) {
    used = false
    schedule()
  }
  hiddenAt = null
}

function register() {
  if (mounted++ === 0) document.addEventListener('visibilitychange', onVisibility)
}

// ログアウトなどで全部のシートが消えたら、次に開いたときは新しい起動として数える
function unregister(kind: LaunchSheet) {
  statuses.delete(kind)
  if (--mounted > 0) { schedule(); return }
  document.removeEventListener('visibilitychange', onVisibility)
  if (timer) clearTimeout(timer)
  timer = null
  active = null
  used = false
  hiddenAt = null
}

function report(kind: LaunchSheet, status: LaunchSheetStatus) {
  if (statuses.get(kind)?.status === status) return
  statuses.set(kind, { status, since: Date.now() })
  schedule()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** このシートを今出してよいとき true。閉じたら status を 'none' にすると、出していた枠が空く */
export function useLaunchSheet(kind: LaunchSheet, status: LaunchSheetStatus): boolean {
  useEffect(() => {
    register()
    return () => unregister(kind)
  }, [kind])
  useEffect(() => { report(kind, status) }, [kind, status])
  return useSyncExternalStore(subscribe, () => active === kind)
}
