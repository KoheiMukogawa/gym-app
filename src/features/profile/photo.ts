import { InputError } from '../../lib/errors'

// プロフィール画像は、アイコンの値 'photo:<ユーザーID>/<ランダムID>.webp|jpg' として保存する。
// 画像を変えるたびにファイル名を変えるので、1年キャッシュさせても古い画像が残らない。
export const PHOTO_PREFIX = 'photo:'
export const PHOTO_SIZE = 256
const BUCKET = 'avatars'
const CACHE_SECONDS = String(60 * 60 * 24 * 365)
const MAX_SOURCE_BYTES = 30 * 1024 * 1024

export function isPhoto(icon: string | null | undefined): icon is string {
  return !!icon && icon.startsWith(PHOTO_PREFIX)
}

/** 公開URL。supabase-js を読み込まずに組み立てる（紹介ページなどでも Avatar を使うため） */
export function photoUrl(icon: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${icon.slice(PHOTO_PREFIX.length)}`
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // 写真の向き（EXIF）を反映して読み込む
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* 下の方法で読み直す */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new InputError('この画像は読み込めませんでした。別の画像を選んでください')
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85))
}

/** 切り抜く範囲（読み込んだ画像の上の正方形。x・y は左上） */
export type Crop = { x: number; y: number; size: number }
/** 向きをそろえ、長い辺を1024pxまでに縮めた画像。トリミング画面の表示と切り抜きに使う */
export type PreparedImage = { canvas: HTMLCanvasElement; width: number; height: number }

const PREPARED_MAX = 1024
/** いちばん寄せたとき、短い辺の1/4まで（それ以上は256pxに引き伸ばすことになり荒くなる） */
const MAX_ZOOM = 4

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/') && file.type !== '') throw new InputError('画像を選んでください')
  if (file.size > MAX_SOURCE_BYTES) throw new InputError('画像が大きすぎます（30MBまで）')
  const image = await decode(file)
  try {
    const scale = Math.min(1, PREPARED_MAX / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context || image.width === 0) throw new InputError('この画像は読み込めませんでした。別の画像を選んでください')
    context.imageSmoothingQuality = 'high'
    context.drawImage(image.source, 0, 0, width, height)
    return { canvas, width, height }
  } finally {
    image.close()
  }
}

/** はじめは短い辺いっぱいの、中央の正方形 */
export function centerCrop(width: number, height: number): Crop {
  const size = Math.min(width, height)
  return { x: (width - size) / 2, y: (height - size) / 2, size }
}

/** 範囲が画像からはみ出さず、寄せすぎないようにする */
export function clampCrop(crop: Crop, width: number, height: number): Crop {
  const full = Math.min(width, height)
  const size = Math.min(full, Math.max(full / MAX_ZOOM, crop.size))
  return {
    size,
    x: Math.min(width - size, Math.max(0, crop.x)),
    y: Math.min(height - size, Math.max(0, crop.y)),
  }
}

/** 画面上で指を dx・dy 動かしたときの範囲。枠の幅 view が範囲の size に当たる */
export function panCrop(crop: Crop, dx: number, dy: number, view: number, width: number, height: number): Crop {
  const perPixel = crop.size / view
  return clampCrop({ ...crop, x: crop.x - dx * perPixel, y: crop.y - dy * perPixel }, width, height)
}

/** 中心を保ったまま、範囲の大きさを変える（zoom は 1＝短い辺いっぱい） */
export function zoomCrop(crop: Crop, zoom: number, width: number, height: number): Crop {
  const size = Math.min(width, height) / Math.min(MAX_ZOOM, Math.max(1, zoom))
  const cx = crop.x + crop.size / 2
  const cy = crop.y + crop.size / 2
  return clampCrop({ x: cx - size / 2, y: cy - size / 2, size }, width, height)
}

export function zoomOf(crop: Crop, width: number, height: number): number {
  return Math.min(width, height) / crop.size
}

export { MAX_ZOOM }

/**
 * 選んだ範囲を256pxの正方形に縮める。描き直すので位置情報などのメタデータは残らない。
 * WebPで書き出せないブラウザー（Safariなど）ではJPEGにする。
 */
export async function cropAvatar(image: PreparedImage, crop: Crop): Promise<Blob> {
  const { x, y, size } = clampCrop(crop, image.width, image.height)
  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_SIZE
  canvas.height = PHOTO_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new InputError('画像を作れませんでした。別の画像を選んでください')
  context.imageSmoothingQuality = 'high'
  context.drawImage(image.canvas, x, y, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
  const webp = await toBlob(canvas, 'image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob(canvas, 'image/jpeg')
  if (!jpeg) throw new InputError('画像を作れませんでした。別の画像を選んでください')
  return jpeg
}

/** 中央を切り抜く（トリミング画面を使わないとき） */
export async function makeAvatarImage(file: File): Promise<Blob> {
  const image = await prepareImage(file)
  return cropAvatar(image, centerCrop(image.width, image.height))
}

async function storage() {
  const { supabase } = await import('../../lib/supabase')
  return supabase.storage.from(BUCKET)
}

/** 本人のフォルダーに新しい名前で上げ、アイコンの値を返す */
export async function uploadPhoto(userId: string, image: Blob): Promise<string> {
  const ext = image.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await (await storage()).upload(path, image, { cacheControl: CACHE_SECONDS, contentType: image.type, upsert: false })
  if (error) throw error
  return PHOTO_PREFIX + path
}

/** 使わなくなった画像を消す。失敗しても表示には影響しないので、呼び出し側は待たなくてよい */
export async function removePhoto(icon: string): Promise<void> {
  if (!isPhoto(icon)) return
  const { error } = await (await storage()).remove([icon.slice(PHOTO_PREFIX.length)])
  if (error) throw error
}

/** 退会の前に、本人のフォルダーの画像をすべて消す */
export async function removeAllPhotos(userId: string): Promise<void> {
  const bucket = await storage()
  const { data, error } = await bucket.list(userId, { limit: 1000 })
  if (error) throw error
  if (!data?.length) return
  const { error: removeError } = await bucket.remove(data.map((file) => `${userId}/${file.name}`))
  if (removeError) throw removeError
}
