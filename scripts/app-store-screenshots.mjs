// App Store用のスクリーンショット（iPhone 6.9インチ、1320×2868）を、紹介ページの見本（/demo）から作る。
// 使い方: node scripts/app-store-screenshots.mjs  → docs/app-store/screenshots/*.png
// 見本は通信しない（src/demo/demoFetch.ts）ので、本番のデータには触れない。
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'docs/app-store/screenshots')
const PORT = 4191
const ORIGIN = `http://127.0.0.1:${PORT}`
// iPhone 16 Pro Max の画面（ポイント）と、上端の時計などの高さ
const SCREEN = { width: 440, height: 956 }
const STATUS_BAR = 62

const SHOTS = [
  { file: '01-home.png', path: '/' },
  { file: '02-dial.png', path: '/log', mode: 'dial' },
  { file: '03-big3.png', path: '/big3' },
  { file: '04-graph.png', path: '/exercises/demo-bench' },
  { file: '05-ranking.png', path: '/ranking' },
  { file: '06-list.png', path: '/log', mode: 'list' },
  { file: '07-body.png', path: '/body' },
  { file: '08-export.png', path: '/export' },
]

// 紹介ページのスマホと同じ時計・電波・電池（src/features/auth/LandingPhone.tsx）
const statusBar = `<div style="height:${STATUS_BAR}px;display:flex;justify-content:space-between;align-items:flex-start;padding:19px 32px 0;color:#fff;font:600 17px/22px -apple-system,system-ui,sans-serif;letter-spacing:-.2px">
  <span>9:41</span>
  <span style="display:flex;gap:7px;align-items:center;height:22px;fill:#fff">
    <svg width="18" height="12" viewBox="0 0 18 12"><rect x="1" y="8" width="3" height="4" rx="1"/><rect x="5.5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="14.5" width="3" height="12" rx="1"/></svg>
    <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 12a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Zm4.3-4.1a6.1 6.1 0 0 0-8.6 0L5.8 9.5a3.8 3.8 0 0 1 5.4 0l1.6-1.6Zm3-3a10.3 10.3 0 0 0-14.6 0l1.6 1.6a8 8 0 0 1 11.4 0l1.6-1.6Z"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".75" y=".75" width="22" height="11.5" rx="3" fill="none" stroke="#fff" stroke-width="1.5"/><rect x="2.5" y="2.5" width="18.5" height="8" rx="1.5"/><path d="M24 4.2c1.2.4 2 1.5 2 2.8s-.8 2.4-2 2.8V4.2Z"/></svg>
  </span>
</div>`

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(ORIGIN)).ok) return } catch { /* まだ起動中 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('開発サーバーが起動しませんでした')
}

mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' })
try {
  await waitForServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: SCREEN, deviceScaleFactor: 3 })
  for (const shot of SHOTS) {
    // 見本は同じオリジンからの合図だけを受け取るので、開発サーバーのページの中に枠を作る
    await page.goto(`${ORIGIN}/privacy`)
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#0a0a0b">${statusBar}
      <iframe id="app" src="/demo?path=${encodeURIComponent(shot.path)}" style="display:block;border:0;width:${SCREEN.width}px;height:${SCREEN.height - STATUS_BAR}px"></iframe></body></html>`)
    await page.waitForFunction(() => new Promise((ok) => {
      window.addEventListener('message', (e) => { if (e.data?.type === 'glog-demo-ready') ok(true) }, { once: true })
    }), null, { timeout: 30_000 }).catch(() => undefined)
    if (shot.mode) {
      await page.evaluate(({ path, mode }) => {
        document.getElementById('app').contentWindow.postMessage({ type: 'glog-demo-navigate', path, mode }, location.origin)
      }, shot)
    }
    // グラフの線のアニメーションや画像の読み込みを待つ
    await page.waitForTimeout(4000)
    await page.screenshot({ path: resolve(out, shot.file) })
    console.log(`saved ${shot.file}`)
  }
  await browser.close()
} finally {
  server.kill()
}
