// `npm run dev`: start Vite, then open the app inside a drawn iPhone 16 Pro in a Chrome
// app window (no tabs or address bar). `npm run dev:pc` starts Vite alone.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

// The app sees an iPhone 16 Pro viewport (402x874). The body adds about 15pt of bezel,
// as on the real phone (71.5mm wide, 66.6mm screen). Chrome zooms everything to 80%,
// so the phone fits a laptop screen at about real size.
const VIEWPORT = { width: 402, height: 874 }
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
  iframe {
    display: block;
    width: ${VIEWPORT.width}px;
    height: ${VIEWPORT.height}px;
    border: 0;
    border-radius: 55px;
    background: #0a0a0b;
  }
</style>
</head>
<body>
<div class="phone"><iframe title="Glog"></iframe></div>
<script>
  const frame = document.querySelector('iframe')
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
