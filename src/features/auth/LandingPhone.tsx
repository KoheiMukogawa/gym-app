import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DEMO_PATH, isDemoReadyMessage, type DemoNavigateMessage, type DemoProgressMessage } from '../../lib/demoMode'

// 開発中のスマホのウインドウ（scripts/dev-phone.mjs）と同じ iPhone 16 Pro の大きさで描き、
// 紹介ページの高さに合わせて縮める
const SCREEN = { width: 402, height: 874 }
const STATUS_BAR = 59
const BEZEL = 15
const DEVICE = { width: SCREEN.width + BEZEL * 2, height: SCREEN.height + BEZEL * 2 }

/** スマホに出す画面。mode は記録画面の入れ方（ダイヤル・一覧）、chapter は紹介ページの説明（見本で流す操作） */
export type PhoneScreen = { path: string; mode?: 'dial' | 'list'; chapter?: string }
// 画面を移るときは、いったん暗くしてから切り替え、読み込みを待って明るく戻す
const DIM_MS = 260
const SETTLE_MS = 420

/**
 * 本物のアプリを見本のデータで動かしたもの（/demo を iframe で開く、src/lib/demoMode.ts）。
 * 画面はアプリと同じ部品なので、アプリを直せばここも次のデプロイで同じになる。
 * screen が変わるたびに（スクロールで次の説明に移ったとき）、少し暗くしてからその画面に切り替える。
 * progress はその説明の中でどこまでスクロールしたか（0〜1）で、スマホの中の画面も合わせて動く。
 */
export function LandingPhone({ screen, progress, splash, showSplash = false }: {
  screen: PhoneScreen; progress: number
  /** アプリを開いたときのような起動画面（アイコン・名前・ひとこと）。showSplash の間と、見本の準備ができるまで重ねる */
  splash?: ReactNode; showSplash?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(0.8)
  // 最初の画面は URL で渡し、その後の切り替えはメッセージで送る（iframe を読み直さない）
  const [src] = useState(() => `${DEMO_PATH}?path=${encodeURIComponent(screen.path)}`)
  const loaded = useRef(false)
  const latest = useRef(screen)
  const [dim, setDim] = useState(false)
  const [ready, setReady] = useState(false)
  const shown = useRef<PhoneScreen | null>(null)

  useEffect(() => {
    const element = box.current
    if (!element) return
    // 拡大・縮小の途中（最初の画面）でも、もとの大きさで測る
    const measure = () => { const height = element.offsetHeight; if (height > 0) setScale(height / DEVICE.height) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const post = useCallback((message: DemoNavigateMessage | DemoProgressMessage) => {
    frame.current?.contentWindow?.postMessage(message, window.location.origin)
  }, [])
  const timers = useRef<number[]>([])
  const show = useCallback((next: PhoneScreen, animate: boolean) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (shown.current === next) return
    shown.current = next
    const go = () => post({ type: 'glog-demo-navigate', ...next })
    if (!animate) { go(); return }
    setDim(true)
    timers.current.push(window.setTimeout(go, DIM_MS), window.setTimeout(() => setDim(false), DIM_MS + SETTLE_MS))
  }, [post])
  useEffect(() => {
    latest.current = screen
    // 見本のアプリが動き出す前の切り替えは、準備ができた知らせ（glog-demo-ready）を受けてから送る
    if (loaded.current) show(screen, true)
  }, [screen, show])
  useEffect(() => {
    if (loaded.current && screen.chapter) post({ type: 'glog-demo-progress', chapter: screen.chapter, progress })
  }, [progress, screen, post])
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || !isDemoReadyMessage(event.data)) return
      loaded.current = true
      setReady(true)
      shown.current = null
      show(latest.current, false)
    }
    window.addEventListener('message', ready)
    const pending = timers.current
    return () => { window.removeEventListener('message', ready); pending.forEach(clearTimeout) }
  }, [show])

  return <div ref={box} className="landing-phone" style={{ aspectRatio: `${DEVICE.width} / ${DEVICE.height}` }}>
    <div className="landing-device" style={{ width: DEVICE.width, height: DEVICE.height, transform: `scale(${scale})` }}>
      <div className="landing-device-screen" style={{ width: SCREEN.width, height: SCREEN.height }}>
        <div className="landing-status-bar" aria-hidden="true" style={{ height: STATUS_BAR }}>
          <span>9:41</span>
          <span className="landing-island" />
          <span className="landing-status-icons">
            <svg width="18" height="12" viewBox="0 0 18 12"><rect x="1" y="8" width="3" height="4" rx="1"/><rect x="5.5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="14.5" width="3" height="12" rx="1"/></svg>
            <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 12a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Zm4.3-4.1a6.1 6.1 0 0 0-8.6 0L5.8 9.5a3.8 3.8 0 0 1 5.4 0l1.6-1.6Zm3-3a10.3 10.3 0 0 0-14.6 0l1.6 1.6a8 8 0 0 1 11.4 0l1.6-1.6Z"/></svg>
            <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".75" y=".75" width="22" height="11.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="2.5" y="2.5" width="18.5" height="8" rx="1.5"/><path d="M24 4.2c1.2.4 2 1.5 2 2.8s-.8 2.4-2 2.8V4.2Z"/></svg>
          </span>
        </div>
        <iframe ref={frame} src={src} title="Glogのアプリの画面（見本）" style={{ width: SCREEN.width, height: SCREEN.height - STATUS_BAR }} />
        <div className="landing-device-dim" data-dim={dim || undefined} aria-hidden="true" />
        {/* 起動画面は中身から暗くなって消え、その後ろからホーム画面が出る */}
        {splash && <div className="landing-splash" data-hidden={(!showSplash && ready) || undefined} style={{ top: STATUS_BAR }}>
          <div className="landing-splash-content">{splash}</div>
        </div>}
      </div>
    </div>
  </div>
}
