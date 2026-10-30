// `npm run dev`: start Vite, then open the app in an iPhone-sized Chrome app window
// (no tabs or address bar). `npm run dev:pc` starts Vite alone.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

// The page sees an iPhone 16 Pro viewport (402x874). Chrome zooms it to 80% and the
// window shrinks by the same ratio, so it fits a laptop screen at about real size.
const VIEWPORT = { width: 402, height: 874 }
const SCALE = 0.8
const TITLE_BAR = 32
const CHROME = '/Applications/Google Chrome.app'

const server = await createServer()
await server.listen()
server.printUrls()
server.bindCLIShortcuts({ print: true })

const url = server.resolvedUrls?.local[0]
if (process.platform !== 'darwin' || !existsSync(CHROME)) {
  console.log('  Google Chrome が見つからないため、スマホ幅のウインドウは開きません。')
} else if (url) {
  // A separate profile so the window size is honored even while normal Chrome is open.
  const profile = resolve('node_modules/.cache/dev-phone-chrome')
  setDefaultZoom(profile, SCALE)
  spawn('open', [
    '-na', CHROME, '--args',
    `--app=${url}`,
    `--window-size=${Math.round(VIEWPORT.width * SCALE)},${Math.round(VIEWPORT.height * SCALE) + TITLE_BAR}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { stdio: 'ignore', detached: true }).unref()
}

function setDefaultZoom(profile, scale) {
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
  writeFileSync(file, JSON.stringify(prefs))
}
