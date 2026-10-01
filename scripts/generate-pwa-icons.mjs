// Usage: node scripts/generate-pwa-icons.mjs [path to an installed sharp module]
// The selected artwork is kept unchanged in glog-icon-source.jpg.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const sharp = require(process.argv[2] || 'sharp')
const root = new URL('../public/', import.meta.url)
const source = new URL('glog-icon-source.jpg', root)
for (const size of [32, 180, 192, 512]) {
  await sharp(fileURLToPath(source)).resize(size, size).png().toFile(fileURLToPath(new URL(`glog-icon-${size}.png`, root)))
}
// Keep the full silhouette within the maskable icon's central safe circle.
const image = await sharp(fileURLToPath(source)).resize(320, 320).png().toBuffer()
await sharp({create:{width:512,height:512,channels:3,background:'#030303'}}).composite([{input:image,gravity:'centre'}]).png().toFile(fileURLToPath(new URL('glog-icon-maskable.png', root)))

// Update legacy URLs and Apple's default icon discovery paths.
const { readFileSync, writeFileSync, copyFileSync } = await import('node:fs')
for (const [to, from] of Object.entries({
  'apple-touch-icon.png': 'glog-icon-180.png',
  'apple-touch-icon-precomposed.png': 'glog-icon-180.png',
  'icon-192.png': 'glog-icon-192.png',
  'icon-512.png': 'glog-icon-512.png',
})) copyFileSync(new URL(from, root), new URL(to, root))
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><image width="180" height="180" href="data:image/png;base64,' + readFileSync(new URL('glog-icon-180.png', root)).toString('base64') + '"/></svg>\n'
for (const name of ['icon.svg', 'favicon.svg']) writeFileSync(new URL(name, root), svg)
const png = readFileSync(new URL('glog-icon-32.png', root))
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
header[6] = 32; header[7] = 32
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18)
writeFileSync(new URL('favicon.ico', root), Buffer.concat([header, png]))
