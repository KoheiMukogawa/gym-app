import { beforeEach, describe, expect, it, vi } from 'vitest'
const bucket = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), list: vi.fn() }))
const from = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from } } }))
import { centerCrop, clampCrop, isPhoto, panCrop, photoUrl, removeAllPhotos, uploadPhoto, zoomCrop, zoomOf } from './photo'

beforeEach(() => {
  vi.clearAllMocks()
  from.mockReturnValue(bucket)
  bucket.upload.mockResolvedValue({ error: null })
  bucket.remove.mockResolvedValue({ error: null })
})

it('uploads to a new file name in the own folder, cached for a year', async () => {
  const icon = await uploadPhoto('u1', new Blob(['x'], { type: 'image/webp' }))
  expect(icon).toMatch(/^photo:u1\/[0-9a-f-]{36}\.webp$/)
  expect(from).toHaveBeenCalledWith('avatars')
  const [path, , options] = bucket.upload.mock.calls[0]
  expect(`photo:${path}`).toBe(icon)
  expect(options).toEqual({ cacheControl: '31536000', contentType: 'image/webp', upsert: false })
  // A second upload never reuses the name, so a long cache cannot show a stale picture.
  expect(await uploadPhoto('u1', new Blob(['y'], { type: 'image/jpeg' }))).toMatch(/\.jpg$/)
  expect(bucket.upload.mock.calls[1][0]).not.toBe(path)
})

it('builds the public URL without loading the client', () => {
  expect(isPhoto('photo:u1/a.webp')).toBe(true)
  expect(isPhoto('barbell')).toBe(false)
  expect(photoUrl('photo:u1/a.webp')).toMatch(/\/storage\/v1\/object\/public\/avatars\/u1\/a\.webp$/)
})

it('removes every file in the own folder before leaving', async () => {
  bucket.list.mockResolvedValue({ data: [{ name: 'a.webp' }, { name: 'b.jpg' }], error: null })
  await removeAllPhotos('u1')
  expect(bucket.list).toHaveBeenCalledWith('u1', { limit: 1000 })
  expect(bucket.remove).toHaveBeenCalledWith(['u1/a.webp', 'u1/b.jpg'])
})

describe('crop', () => {
  it('starts from the centered square of the short side', () => {
    expect(centerCrop(800, 400)).toEqual({ x: 200, y: 0, size: 400 })
    expect(centerCrop(300, 600)).toEqual({ x: 0, y: 150, size: 300 })
  })

  it('moves the opposite way to the finger and stays inside the picture', () => {
    // The 280px frame shows 400 picture pixels; dragging the picture right by 70px reveals 100px more on the left.
    expect(panCrop({ x: 200, y: 0, size: 400 }, 70, 0, 280, 800, 400)).toEqual({ x: 100, y: 0, size: 400 })
    expect(panCrop({ x: 200, y: 0, size: 400 }, 1000, 1000, 280, 800, 400)).toEqual({ x: 0, y: 0, size: 400 })
    expect(panCrop({ x: 200, y: 0, size: 400 }, -1000, 0, 280, 800, 400)).toEqual({ x: 400, y: 0, size: 400 })
  })

  it('zooms around the center, between the whole short side and a quarter of it', () => {
    expect(zoomCrop({ x: 200, y: 0, size: 400 }, 2, 800, 400)).toEqual({ x: 300, y: 100, size: 200 })
    expect(zoomCrop({ x: 200, y: 0, size: 400 }, 10, 800, 400)).toEqual({ x: 350, y: 150, size: 100 })
    expect(zoomCrop({ x: 300, y: 100, size: 200 }, 0.5, 800, 400)).toEqual({ x: 200, y: 0, size: 400 })
    expect(zoomOf({ x: 300, y: 100, size: 200 }, 800, 400)).toBe(2)
    expect(clampCrop({ x: -50, y: 900, size: 1000 }, 800, 400)).toEqual({ x: 0, y: 0, size: 400 })
  })
})
