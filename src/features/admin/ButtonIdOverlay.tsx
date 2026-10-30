import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { buttonIdFor } from './buttonIds'

type Badge = { id: string, top: number, left: number }

/** Admin-only labels outside the controls, so IDs never change tap targets or accessible names. */
export function ButtonIdOverlay({ screenId, root }: { screenId: string | null, root: HTMLElement | null }) {
  const [badges, setBadges] = useState<Badge[]>([])

  useLayoutEffect(() => {
    if (!screenId || !root) return
    let frame = 0
    const scan = () => {
      frame = 0
      const counts = new Map<string, number>()
      const next: Badge[] = []
      for (const element of root.querySelectorAll<HTMLElement>('button, a[href]')) {
        if (element.closest('[hidden], [aria-hidden="true"]')) continue
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue
        const key = element.dataset.buttonKey || element.getAttribute('aria-label') || element.textContent?.trim()
        if (!key) continue
        const normalized = key.replace(/\s+/g, ' ').trim()
        const identity = normalized.toLowerCase()
        const count = (counts.get(identity) ?? 0) + 1
        counts.set(identity, count)
        const id = buttonIdFor(screenId, normalized, count)
        const labelWidth = id.length * 6 + 12
        next.push({ id, top: Math.max(0, rect.top), left: Math.max(labelWidth, Math.min(innerWidth - 8, rect.right)) })
      }
      setBadges(next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(scan) }
    const observer = new MutationObserver(schedule)
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'hidden', 'href', 'style'] })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    scan()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [screenId, root])

  if (!screenId || !root) return null
  return createPortal(<div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] font-mono text-[10px] leading-none">
    {badges.map((badge) => <span key={badge.id} className="absolute whitespace-nowrap rounded border border-accent bg-bg px-1 py-0.5 text-accent shadow-sm"
      style={{ top: badge.top, left: badge.left, transform: 'translate(-100%, -40%)' }}>{badge.id}</span>)}
  </div>, document.body)
}
