/** Same action on the same screen keeps its ID when its position changes. */
export function buttonIdFor(screenId: string, key: string, occurrence = 1): string {
  let hash = 2166136261
  for (const character of key.trim().replace(/\s+/g, ' ').toLowerCase()) {
    hash ^= character.codePointAt(0)!
    hash = Math.imul(hash, 16777619)
  }
  const suffix = (hash >>> 0).toString(36).toUpperCase().padStart(7, '0')
  return `${screenId}-B${suffix}${occurrence > 1 ? `-${occurrence}` : ''}`
}
