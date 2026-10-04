import { useEffect, useRef, useState } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Eased 0 → 1 over `durationMs` after mount; 1 right away when the user asks for less motion. */
export function useRevealProgress(durationMs: number): number {
  const [instant] = useState(prefersReducedMotion)
  const [progress, setProgress] = useState(instant ? 1 : 0)
  useEffect(() => {
    if (instant) return
    let frame = 0
    let start: number | null = null
    const tick = (now: number) => {
      start ??= now
      const t = Math.min(1, (now - start) / durationMs)
      setProgress(1 - (1 - t) ** 3)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [instant, durationMs])
  return progress
}

/** Becomes true once the element is mostly on screen, and stays true. */
export function useSeenOnce<T extends Element>(threshold = 0.5) {
  const ref = useRef<T>(null)
  // Without IntersectionObserver (older browsers, tests) show the content right away.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const element = ref.current
    if (seen || !element) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setSeen(true); observer.disconnect() }
    }, { threshold })
    observer.observe(element)
    return () => observer.disconnect()
  }, [seen, threshold])
  return [ref, seen] as const
}
