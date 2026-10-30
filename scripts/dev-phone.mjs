// `npm run dev`: start Vite, then open the app inside a drawn iPhone 16 Pro in a Chrome
// app window (no tabs or address bar). `npm run dev:pc` starts Vite alone.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

// The simulated screen is the iPhone 16 Pro's 402x874 logical resolution. The app gets
// the usable area below the 59pt status bar. The body adds about 15pt of bezel, and Chrome
// zooms everything to 80% so it fits a laptop screen.
const VIEWPORT = { width: 402, height: 874 }
const STATUS_BAR = 59
const BEZEL = 15
const MARGIN = 12
const SCALE = 0.8
const TITLE_BAR = 32
const FRAME_PATH = '/__phone'
const CHROME = '/Applications/Google Chrome.app'

const server = await createServer({ plugins: [phoneFramePage()] })
await server.listen()
server.printUrls()
server.bindCLIShortcuts({ print: true })

const url = server.resolvedUrls?.local[0]
if (process.platform !== 'darwin' || !existsSync(CHROME)) {
  console.log('  Google Chrome が見つからないため、スマホのウインドウは開きません。')
} else if (url) {
  // A separate profile so the window size is honored even while normal Chrome is open.
  const profile = resolve('node_modules/.cache/dev-phone-chrome')
  prepareProfile(profile, SCALE)
  const outer = (size) => Math.round((size + (BEZEL + MARGIN) * 2) * SCALE)
  spawn('open', [
    '-na', CHROME, '--args',
    `--app=${new URL(FRAME_PATH, url)}`,
    `--window-size=${outer(VIEWPORT.width)},${outer(VIEWPORT.height) + TITLE_BAR}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { stdio: 'ignore', detached: true }).unref()
}

function prepareProfile(profile, scale) {
  const file = resolve(profile, 'Default/Preferences')
  let prefs = {}
  try {
    prefs = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    mkdirSync(resolve(profile, 'Default'), { recursive: true })
  }
  // Chrome stores zoom as a level where each step is a factor of 1.2; "x" is the default partition.
  prefs.partition = { ...prefs.partition, default_zoom_level: { x: Math.log(scale) / Math.log(1.2) } }
  // Chrome reopens app windows at their last size, which would override --window-size.
  delete prefs.browser?.app_window_placement
  // A window closed by killing Chrome counts as a crash, and Chrome would restore it at its old size.
  prefs.profile = { ...prefs.profile, exit_type: 'Normal', exited_cleanly: true }
  writeFileSync(file, JSON.stringify(prefs))
  rmSync(resolve(profile, 'Default/Sessions'), { recursive: true, force: true })
}

function phoneFramePage() {
  return {
    name: 'dev-phone-frame',
    configureServer(devServer) {
      devServer.middlewares.use((req, res, next) => {
        if (new URL(req.url ?? '/', 'http://x').pathname !== FRAME_PATH) return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(frameHtml())
      })
    },
  }
}

// The frame keeps the app's path in its own URL (?path=), so Cmd+R reopens the same screen.
function frameHtml() {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>Glog（iPhone 16 Pro）</title>
<style>
  html, body { margin: 0; height: 100%; background: #2a2a2e; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  .phone {
    padding: ${BEZEL}px;
    border-radius: 70px;
    background: #000;
    box-shadow: inset 0 0 0 3px #77767a, inset 0 0 0 4px #2b2b2e, 0 16px 40px rgba(0, 0, 0, .45);
  }
  .screen {
    width: ${VIEWPORT.width}px;
    height: ${VIEWPORT.height}px;
    overflow: hidden;
    border-radius: 55px;
    background: #0a0a0b;
    color: #f7f7f8;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  }
  .status-bar {
    position: relative;
    display: flex;
    height: ${STATUS_BAR}px;
    box-sizing: border-box;
    align-items: flex-start;
    justify-content: space-between;
    padding: 17px 27px 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
    letter-spacing: -0.2px;
    user-select: none;
  }
  .dynamic-island {
    position: absolute;
    left: 50%;
    top: 11px;
    width: 104px;
    height: 31px;
    transform: translateX(-50%);
    border-radius: 18px;
    background: #000;
  }
  .status-icons { display: flex; height: 20px; align-items: center; gap: 7px; }
  .status-icons svg { display: block; fill: currentColor; }
  iframe {
    display: block;
    width: ${VIEWPORT.width}px;
    height: ${VIEWPORT.height - STATUS_BAR}px;
    border: 0;
    background: #0a0a0b;
  }
</style>
</head>
<body>
<div class="phone"><div class="screen">
  <div class="status-bar" aria-hidden="true">
    <span id="status-time">9:41</span>
    <span class="dynamic-island"></span>
    <span class="status-icons">
      <svg width="18" height="12" viewBox="0 0 18 12"><rect x="1" y="8" width="3" height="4" rx="1"/><rect x="5.5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="14.5" width="3" height="12" rx="1"/></svg>
      <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 12a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Zm4.3-4.1a6.1 6.1 0 0 0-8.6 0L5.8 9.5a3.8 3.8 0 0 1 5.4 0l1.6-1.6Zm3-3a10.3 10.3 0 0 0-14.6 0l1.6 1.6a8 8 0 0 1 11.4 0l1.6-1.6Z"/></svg>
      <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".75" y=".75" width="22" height="11.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="2.5" y="2.5" width="18.5" height="8" rx="1.5"/><path d="M24 4.2c1.2.4 2 1.5 2 2.8s-.8 2.4-2 2.8V4.2Z"/></svg>
    </span>
  </div>
  <iframe title="Glog"></iframe>
</div></div>
<script>
  const frame = document.querySelector('iframe')
  const time = document.querySelector('#status-time')
  const updateTime = () => { time.textContent = new Intl.DateTimeFormat('ja-JP', { hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date()) }
  updateTime()
  setInterval(updateTime, 30000)
  frame.src = new URLSearchParams(location.search).get('path') || '/'
  setInterval(() => {
    let loc
    try { loc = frame.contentWindow.location } catch { return }
    if (loc.href === 'about:blank') return
    const next = '${FRAME_PATH}?path=' + encodeURIComponent(loc.pathname + loc.search + loc.hash)
    if (location.pathname + location.search !== next) history.replaceState(null, '', next)
  }, 300)
</script>
</body>
</html>
`
}
