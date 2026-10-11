// Runs after `vite build` and `vite build --ssr src/prerender.tsx`. Writes one static HTML file
// per public page (dist/calculators/1rm.html …) and dist/sitemap.xml. Vercel serves those files
// through the explicit rewrites in vercel.json; the app shell (index.html) stays untouched so
// signed-in screens never flash public content.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const ssrDir = resolve(root, 'dist-ssr')
const { PUBLIC_PAGES, SITE_URL, renderPage, headTags } = await import(pathToFileURL(resolve(ssrDir, 'prerender.js')).href)

// A page without a rewrite would silently fall back to the empty shell in production.
const rewrites = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).rewrites
for (const page of PUBLIC_PAGES) {
  if (!rewrites.some((r) => r.source === page.path && r.destination === `${page.path}.html`)) {
    throw new Error(`vercel.json needs { "source": "${page.path}", "destination": "${page.path}.html" } before the catch-all`)
  }
}

const template = readFileSync(resolve(dist, 'index.html'), 'utf8')
// Tags each page replaces with its own; everything else (icons, scripts, CSS) is kept.
const replaced = [
  /\s*<title>[^<]*<\/title>/,
  /\s*<meta name="description"[^>]*>/,
  /\s*<meta property="og:type"[^>]*>/,
  /\s*<meta property="og:title"[^>]*>/,
  /\s*<meta property="og:description"[^>]*>/,
  /\s*<meta name="twitter:title"[^>]*>/,
]
const shell = replaced.reduce((html, pattern) => {
  if (!pattern.test(html)) throw new Error(`index.html no longer has ${pattern}`)
  return html.replace(pattern, '')
}, template)
if (!shell.includes('<div id="root"></div>')) throw new Error('index.html no longer has an empty #root')

for (const page of PUBLIC_PAGES) {
  const html = shell
    .replace('</head>', `  ${headTags(page)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root" data-prerendered="${page.path}">${renderPage(page.path)}</div>`)
  const file = resolve(dist, `.${page.path}.html`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, html)
  console.log(`prerendered ${page.path}`)
}

const entries = [{ path: '/', updated: null }, ...PUBLIC_PAGES.map((p) => ({ path: p.path, updated: p.updated }))]
writeFileSync(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${SITE_URL}${e.path}</loc>${e.updated ? `<lastmod>${e.updated}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`)
writeFileSync(resolve(dist, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`)
rmSync(ssrDir, { recursive: true, force: true })
console.log('wrote sitemap.xml and robots.txt')
