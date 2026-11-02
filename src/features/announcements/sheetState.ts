import { useSyncExternalStore } from 'react'

/**
 * 起動時のお知らせのシートの状態。ほかの起動時のシート（投票など）は、これが idle になってから出し、
 * 同じ起動で2枚が重ならないようにする。checking は未読を確かめている間。
 */
export type AnnouncementSheetState = 'checking' | 'showing' | 'idle'

let state: AnnouncementSheetState = 'checking'
const listeners = new Set<() => void>()

export function setAnnouncementSheetState(next: AnnouncementSheetState) {
  if (state === next) return
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** お知らせのシートを出していない（確かめ終えた）とき true */
export function useAnnouncementSheetIdle(): boolean {
  return useSyncExternalStore(subscribe, () => state === 'idle')
}
