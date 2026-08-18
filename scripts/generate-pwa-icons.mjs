import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const BACKGROUND = [0x0a, 0x0a, 0x0b]
const ACCENT = [0xe8, 0x41, 0x2f]

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type)
  const payload = Buffer.concat([typeBytes, data])
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  checksum.writeUInt32BE(crc32(payload))
  return Buffer.concat([length, payload, checksum])
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width
  const bottom = top + height
  if (x < left || x >= right || y < top || y >= bottom) return false
  const nearestX = Math.max(left + radius, Math.min(x, right - radius))
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius))
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2
}

function createIcon(size) {
  const scale = size / 512
  const shapes = [
    [128, 232, 256, 48, 24],
    [92, 168, 52, 176, 20],
    [48, 200, 52, 112, 20],
    [368, 168, 52, 176, 20],
    [412, 200, 52, 112, 20],
  ].map((shape) => shape.map((value) => value * scale))
  const raw = Buffer.alloc((size * 3 + 1) * size)

  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const color = shapes.some(([left, top, width, height, radius]) =>
        insideRoundedRect(x + 0.5, y + 0.5, left, top, width, height, radius),
      )
        ? ACCENT
        : BACKGROUND
      const offset = row + 1 + x * 3
      raw[offset] = color[0]
      raw[offset + 1] = color[1]
      raw[offset + 2] = color[2]
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), createIcon(size))
}
