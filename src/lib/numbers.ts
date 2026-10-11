/** Accepts full-width digits and a comma as the decimal mark. Empty or invalid → null. */
export function parseNumber(text: string): number | null {
  const normalized = text.normalize('NFKC').replace(/,/g, '.').trim()
  if (normalized === '') return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}
