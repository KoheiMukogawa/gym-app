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
