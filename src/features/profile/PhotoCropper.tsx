import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { toMessage } from '../../lib/errors'
import { centerCrop, cropAvatar, MAX_ZOOM, panCrop, prepareImage, zoomCrop, zoomOf, type Crop, type PreparedImage } from './photo'

type Pointer = { x: number; y: number }

// 丸は枠より一回り小さくし、丸の外の写真も暗く見せる（どこを外しているか分かるように）
const RING = 0.78

/**
 * 写真のどこをアイコンにするかを選ぶ。丸い枠の中が使われる範囲で、ドラッグで位置、
 * 2本指のピンチかスライダーで大きさを変える。決めた範囲を256pxに縮めて返す。
 */
export function PhotoCropper({ file, onDone, onCancel }: { file: File; onDone: (image: Blob) => void; onCancel: () => void }) {
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState(280)
  const frame = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Pointer>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    prepareImage(file).then((prepared) => {
      if (!active) return
      setImage(prepared)
      setCrop(centerCrop(prepared.width, prepared.height))
      prepared.canvas.toBlob((blob) => {
        if (!active || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      }, 'image/jpeg', 0.9)
    }).catch((e) => { if (active) setError(toMessage(e)) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [file])

  // 枠の幅に合わせて、指の動きを画像の上の距離に直す
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => setView(element.getBoundingClientRect().width || 280)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [image])

  function distance() {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (!image || !crop) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom: zoomOf(crop, image.width, image.height) }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const last = pointers.current.get(event.pointerId)
    if (!last || !image) return
    const next = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, next)
    if (pointers.current.size >= 2 && pinch.current) {
      const ratio = distance() / Math.max(1, pinch.current.distance)
      const zoom = pinch.current.zoom * ratio
      setCrop((old) => old && zoomCrop(old, zoom, image.width, image.height))
      return
    }
    setCrop((old) => old && panCrop(old, next.x - last.x, next.y - last.y, ring, image.width, image.height))
  }

  function up(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  // キーボードでも動かせる（矢印で位置、＋−で大きさ）
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (!image || !crop) return
    const step = 16
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[event.key]) {
      event.preventDefault()
      setCrop(panCrop(crop, moves[event.key][0], moves[event.key][1], ring, image.width, image.height))
    } else if (event.key === '+' || event.key === '-') {
      event.preventDefault()
      setCrop(zoomCrop(crop, zoomOf(crop, image.width, image.height) * (event.key === '+' ? 1.1 : 1 / 1.1), image.width, image.height))
    }
  }

  async function confirm() {
    if (!image || !crop) return
    setBusy(true)
    setError(null)
    try { onDone(await cropAvatar(image, crop)) }
    catch (e) { setError(toMessage(e)); setBusy(false) }
  }

  const ring = view * RING
  const inset = (view - ring) / 2
  const scale = crop ? ring / crop.size : 1
  const zoom = image && crop ? zoomOf(crop, image.width, image.height) : 1
  return <BottomSheet title="写真の範囲を選ぶ" closeLabel="閉じる" dismissible={!busy} onDismiss={onCancel}>
    <div className="space-y-4 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <p className="text-sm text-muted">丸の中がアイコンになります。ドラッグで位置、ピンチかスライダーで大きさを変えられます。</p>
      <div ref={frame} role="application" tabIndex={0} aria-label="写真の範囲。矢印キーで位置、＋と−で大きさを変える"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        className="relative mx-auto aspect-square w-full max-w-72 cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-black active:cursor-grabbing">
        {image && crop && url && <img src={url} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
          style={{ width: image.width * scale, height: image.height * scale, left: inset - crop.x * scale, top: inset - crop.y * scale }} />}
        {/* 丸の外を暗くして、使われる範囲を見せる */}
        <div aria-hidden="true" className="pointer-events-none absolute rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{ left: inset, top: inset, width: ring, height: ring }} />
        {!image && !error && <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-muted">読み込み中…</p>}
      </div>
      <label className="flex items-center gap-3 text-xs text-muted">
        <span>小</span>
        <input type="range" aria-label="大きさ" min={1} max={MAX_ZOOM} step={0.01} value={zoom} disabled={!image || busy}
          onChange={(e) => image && crop && setCrop(zoomCrop(crop, Number(e.target.value), image.width, image.height))}
          className="min-h-11 flex-1 accent-accent" />
        <span>大</span>
      </label>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button onClick={() => void confirm()} disabled={!image || busy}>{busy ? '作成中…' : 'この範囲にする'}</Button>
    </div>
  </BottomSheet>
}
